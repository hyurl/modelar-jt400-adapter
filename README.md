# Modelar-JT400-Adapter

**This is an adapter for [Modelar](https://github.com/hyurl/modelar) to** 
**connect old versions of DB2 database via jt400/JDBC.**

## Install

```sh
npm install modelar-jt400-adapter --save
```

PS: jt400 adapter only support Modelar 3.0+.

## How To Use

```javascript
const { DB } = require("modelar");
const { IbmdbAdapter } = require("modelar-jt400-adapter");

DB.setAdapter("ibmdb", IbmdbAdapter).init({
    type: "ibmdb",
    database: "SAMPLE",
    host: "127.0.0.1",
    port: 50000,
    user: "db2admin",
    password: "******"
});
```

## Warning

DB2 database transfers identifiers to UPPER-CASE by default, but with this 
adapter, they will keep the form of which they're defined.

This adapter is based on [node-jt400](https://www.npmjs.com/package/node-jt400),
only meant to connect old versions of DB2 (lower 9.7, I guess), it doesn't 
implement all the features of the Modelar base adapter. For new versions, 
please use 
[modelar-ibmdb-adapter](https://www.npmjs.com/package/modelar-ibmdb-adapter) 
instead.

This adapter accepts some additional configurations for the connection, please
check them out at 
[https://www.ibm.com/support/knowledgecenter/en/ssw_ibm_i_73/rzahh/jdbcproperties.htm](https://www.ibm.com/support/knowledgecenter/en/ssw_ibm_i_73/rzahh/jdbcproperties.htm).