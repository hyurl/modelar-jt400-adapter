import { Adapter, DB, Table, Query, DBConfig } from "modelar";
import { pool, Connection } from "node-jt400";

export class IbmdbAdapter extends Adapter {
    connection: Connection;
    originConnection: Connection;
    backquote = "\"";

    static readonly Pools: { [dsn: string]: Connection } = {};

    connect(db: DB): Promise<DB> {
        let config = Object.assign({}, db.config, {
            host: db.config.host,
            user: db.config.user,
            password: db.config.password,
            "database name": db.config.database,
            "query timeout mechanism": db.config.timeout
        });

        if (config.host && config.port) {
            config.host += ":" + config.port
        }

        delete config.charset;
        delete config.connectionString;
        delete config.database;
        delete config.max;
        delete config.port;
        delete config.protocol;
        delete config.socketPath;
        delete config.ssl;
        delete config.timeout;
        delete config.type;

        return new Promise((resolve, reject) => {
            try {
                if (IbmdbAdapter.Pools[db.dsn] === undefined)
                    IbmdbAdapter.Pools[db.dsn] = pool(config);

                this.connection = IbmdbAdapter.Pools[db.dsn];
                resolve(db);
            } catch (err) {
                reject(err);
            }
        });
    }

    query(db: DB, sql: string, bindings?: any[]): Promise<DB> {
        if (db.command == "insert") {
            return this.connection.insertAndGetId(sql, bindings).then(id => {
                db.insertId = id;
                return db;
            });
        } else if (db.command == "update" || db.command == "delete") {
            return this.connection.update(sql, bindings).then(rows => {
                db.affectedRows = rows;
                return db;
            });
        } else {
            return this.connection.query(sql, bindings).then(res => {
                db.data = res;
                return db;
            });
        }
    }

    transaction(db: DB, cb?: (db: DB) => any): Promise<DB> {
        let promise: Promise<DB> = this.connection.transaction(connection => {
            this.originConnection = this.connection;
            this.connection = <any>connection;

            return Promise.resolve(db);
        });

        if (typeof cb == "function") {
            return promise.then(db => {
                var res = cb.call(db, db);

                if (res.then instanceof Function) {
                    return res.then(() => db) as Promise<DB>;
                } else {
                    return db;
                }
            }).then(db => {
                this.connection = this.originConnection;
                this.originConnection = null;
                return db;
            }).catch(err => {
                this.connection = this.originConnection;
                this.originConnection = null;

                // re-throw the err.
                throw err;
            });
        } else {
            return promise;
        }
    }

    commit(db: DB): Promise<DB> {
        return this.connection.execute("commit").then(() => {
            this.connection = this.originConnection;
            this.originConnection = null;

            return db;
        });
    }

    rollback(db: DB): Promise<DB> {
        return this.connection.execute("rollback").then(() => {
            this.connection = this.originConnection;
            this.originConnection = null;

            return db;
        });
    }

    release(): void {
        this.close();
    }

    close(): void {
        if (this.connection)
            this.connection = null;
    }

    static close(): void {
        for (let i in IbmdbAdapter.Pools) {
            IbmdbAdapter.Pools[i] = null;
            delete IbmdbAdapter.Pools[i];
        }
    }

    getDDL(table: Table) {
        let numbers = ["int", "integer"],
            columns: string[] = [],
            foreigns: string[] = [];
        let primary: string;
        let autoIncrement: string;

        for (let key in table.schema) {
            let field = table.schema[key];

            if (field.primary && field.autoIncrement) {
                if (!numbers.includes(field.type.toLowerCase())) {
                    field.type = "int";
                }

                autoIncrement = ` generated always as identity (start with ${field.autoIncrement[0]}, increment by ${field.autoIncrement[1]})`;
            } else {
                autoIncrement = null;
            }

            if (field.length instanceof Array) {
                field.type += "(" + field.length.join(",") + ")";
            } else if (field.length) {
                field.type += "(" + field.length + ")";
            }

            let column = table.backquote(field.name) + " " + field.type;

            if (field.primary)
                primary = field.name;

            if (field.default === null)
                column += " default null";
            else if (field.default !== undefined)
                column += " default " + table.quote(field.default);

            if (field.notNull)
                column += " not null";

            if (field.unsigned)
                column += " unsigned";

            if (field.unique)
                column += " unique";

            if (field.comment)
                column += " comment " + table.quote(field.comment);

            if (autoIncrement)
                column += autoIncrement;

            if (field.foreignKey.table) {
                let foreign = `foreign key (${table.backquote(field.name)})` +
                    " references " + table.backquote(field.foreignKey.table) +
                    " (" + table.backquote(field.foreignKey.field) + ")" +
                    " on delete " + field.foreignKey.onDelete +
                    " on update " + field.foreignKey.onUpdate;

                foreigns.push(foreign);
            };

            columns.push(column);
        }

        let sql = "create table " + table.backquote(table.name) +
            " (\n\t" + columns.join(",\n\t");

        if (primary)
            sql += ",\n\tprimary key(" + table.backquote(primary) + ")";

        if (foreigns.length)
            sql += ",\n\t" + foreigns.join(",\n\t");

        return sql + "\n)";
    }

    /** Methods for Query */

    limit(query: Query, length: number, offset?: number): Query {
        if (!offset) {
            query["_limit"] = length;
        } else {
            query["_limit"] = [offset, length];
        }
        return query;
    }

    getSelectSQL(query: Query): string {
        let selects: string = query["_selects"];
        let distinct: string = query["_distinct"];
        let join: string = query["_join"];
        let where: string = query["_where"];
        let orderBy: string = query["_orderBy"];
        let groupBy: string = query["_groupBy"];
        let having: string = query["_having"];
        let union: string = query["_union"];
        let limit: number | [number, number] = <any>query["_limit"];
        let isCount = (/count\(distinct\s\S+\)/i).test(selects);
        let paginated = limit instanceof Array;

        distinct = distinct && !isCount ? "distinct " : "";
        where = where ? ` where ${where}` : "";
        orderBy = orderBy ? `order by ${orderBy}` : "";
        groupBy = groupBy ? ` group by ${groupBy}` : "";
        having = having ? ` having ${having}` : "";
        union = union ? ` union ${union}` : "";

        let sql = "select " + distinct + selects;

        if (paginated)
            sql += `, row_number() over(${orderBy}) rn`;

        sql += " from " +
            (!join ? query.backquote(query.table) : "") + join + where;

        if (!paginated && orderBy)
            sql += ` ${orderBy}`;

        sql += groupBy + having;

        if (limit) {
            if (paginated) {
                sql = `select * from (${sql}) tmp where tmp.rn > ${limit[0]} and tmp.rn <= ${limit[0] + limit[1]}`;
            } else {
                sql += ` fetch first ${limit} rows only`;
            }
        }

        return sql += union;
    }
}