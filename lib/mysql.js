var mysql = require("mysql");
var configUtil = require("config");

var pool = mysql.createPool(configUtil.get("dbConfig"));

var query = function(sql, callback){  
    pool.getConnection(function(err, conn){  
        if(err){  
            callback(err, null, null);  
        }else{  
            conn.query(sql, function(qerr, vals, fields){  
                conn.destroy();
                callback(qerr, vals, fields);
            });  
        }  
    });  
};

module.exports = query;
  