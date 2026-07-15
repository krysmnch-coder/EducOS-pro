const db = require('./database');

// Wrapper pour rendre better-sqlite3 compatible avec l'API sqlite3
function wrapDb(dbInstance) {
    if (!dbInstance) return null;
    return {
        get: (sql, params, callback) => {
            try {
                const row = dbInstance.prepare(sql).get(...(Array.isArray(params) ? params : [params]));
                callback(null, row);
            } catch(e) { callback(e); }
        },
        all: (sql, params, callback) => {
            try {
                const rows = dbInstance.prepare(sql).all(...(Array.isArray(params) ? params : [params]));
                callback(null, rows);
            } catch(e) { callback(e); }
        },
        run: (sql, params, callback) => {
            try {
                const result = dbInstance.prepare(sql).run(...(Array.isArray(params) ? params : [params]));
                if (callback) callback.call({ lastID: result.lastInsertRowid, changes: result.changes }, null);
            } catch(e) { if (callback) callback(e); }
        },
        exec: (sql) => dbInstance.exec(sql)
    };
}

module.exports = { wrapDb };