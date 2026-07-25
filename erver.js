[1mdiff --cc server.js[m
[1mindex 1b3e918,8cf93a2..714f9ed[m
[1m--- a/server.js[m
[1m+++ b/server.js[m
[36m@@@ -52,15 -52,15 +52,6 @@@[m [mapp.use('/uploads', express.static(uplo[m
  //     database: 'jb_pos_db'[m
  // });[m
  [m
[31m- // const db = mysql.createConnection({[m
[31m- //     host: process.env.DB_HOST || 'mysql-335d3858-pos-project.f.aivencloud.com',[m
[31m- //     user: process.env.DB_USER || 'avnadmin',[m
[31m- //     password: process.env.DB_PASSWORD,[m
[31m- //     //password: process.env.DB_PASSWORD || 'AVNS_YTxkP6WgP4Ktj2jPk2L',[m
[31m- //     database: process.env.DB_NAME || 'jb_pos_db',[m
[31m- //     port: process.env.DB_PORT || 26228,[m
[31m- //     ssl: { rejectUnauthorized: false }[m
[31m- // });[m
[31m -const db = mysql.createConnection({[m
[31m -    host: process.env.DB_HOST || 'mysql-335d3858-pos-project.f.aivencloud.com',[m
[31m -    user: process.env.DB_USER || 'avnadmin',[m
[31m -    password: process.env.DB_PASSWORD,[m
[31m -    //password: process.env.DB_PASSWORD || 'AVNS_YTxkP6WgP4Ktj2jPk2L',[m
[31m -    database: process.env.DB_NAME || 'jb_pos_db',[m
[31m -    port: process.env.DB_PORT || 26228,[m
[31m -    ssl: { rejectUnauthorized: false }[m
[31m -});[m
  [m
  // const db = mysql.createConnection({[m
  //     host: process.env.DB_HOST || 'mysql-335d3858-pos-project.f.aivencloud.com',[m
[36m@@@ -74,57 -74,57 +65,57 @@@[m
  [m
  [m
  //const isLocal = 'online' !== 'production' && !process.env.DB_HOST;[m
[31m--// const isLocal = 'True';[m
[32m++const isLocal = 'False';[m
[32m++[m
[32m++const dbConfig = isLocal ? {[m
[32m++    // 💻 LOCAL DATABASE CONFIG (PC MySQL)[m
[32m++    host: 'localhost',[m
[32m++    user: 'root',[m
[32m++    password: 'root', // Unga PC local MySQL password[m
[32m++    database: 'jb_pos_db',[m
[32m++} : {[m
[32m++    // 🌐 ONLINE DATABASE CONFIG (Aiven Cloud)[m
[32m++    host: process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',[m
[32m++    user: process.env.DB_USER || 'HojFcYtE4maWpx7.root',[m
[32m++    password: process.env.DB_PASSWORD, // Render env variable or fallback[m
[32m++    database: process.env.DB_NAME || 'jb_pos_db',[m
[32m++    port: process.env.DB_PORT || 4000,[m
[32m++    ssl: { rejectUnauthorized: false }[m
[32m++};[m
  [m
[31m--// const dbConfig = isLocal ? {[m
[31m--//     // 💻 LOCAL DATABASE CONFIG (PC MySQL)[m
[31m--//     host: 'localhost',[m
[31m--//     user: 'root',[m
[31m--//     password: 'root', // Unga PC local MySQL password[m
[31m--//     database: 'jb_pos_db',[m
[31m--// } : {[m
[31m--//     // 🌐 ONLINE DATABASE CONFIG (Aiven Cloud)[m
[32m++const db = mysql.createConnection(dbConfig);[m
[32m++[m
[32m++[m
[32m++db.connect((err) => {[m
[32m++    if (err) {[m
[32m++        console.error('Database connection failed: ' + err.stack);[m
[32m++        return;[m
[32m++    }[m
[32m++    console.log('Connected to MySQL Database successfully.');[m
[32m++});[m
[32m++[m
[32m++// const db = mysql.createPool({[m
  //     host: process.env.DB_HOST || 'mysql-335d3858-pos-project.f.aivencloud.com',[m
  //     user: process.env.DB_USER || 'avnadmin',[m
[31m--//     password: process.env.DB_PASSWORD, // Render env variable or fallback[m
[32m++//     password: process.env.DB_PASSWORD,[m
  //     database: process.env.DB_NAME || 'jb_pos_db',[m
  //     port: process.env.DB_PORT || 26228,[m
[31m--//     ssl: { rejectUnauthorized: false }[m
[31m--// };[m
[31m--[m
[31m--// const db = mysql.createConnection(dbConfig);[m
[31m--[m
[32m++//     ssl: { rejectUnauthorized: false },[m
[32m++//     waitForConnections: true,[m
[32m++//     connectionLimit: 10,[m
[32m++//     queueLimit: 0[m
[32m++// });[m
  [m
[31m--// db.connect((err) => {[m
[32m++// // Test the pool connection on start[m
[32m++// db.getConnection((err, connection) => {[m
  //     if (err) {[m
[31m--//         console.error('Database connection failed: ' + err.stack);[m
[32m++//         console.error('Database connection failed:', err.message);[m
  //         return;[m
  //     }[m
[31m--//     console.log('Connected to MySQL Database successfully.');[m
[32m++//     console.log('Connected to Aiven MySQL Database successfully via Pool.');[m
[32m++//     connection.release(); // Release connection back to pool[m
  // });[m
  [m
[31m--const db = mysql.createPool({[m
[31m--    host: process.env.DB_HOST || 'mysql-335d3858-pos-project.f.aivencloud.com',[m
[31m--    user: process.env.DB_USER || 'avnadmin',[m
[31m--    password: process.env.DB_PASSWORD,[m
[31m--    database: process.env.DB_NAME || 'jb_pos_db',[m
[31m--    port: process.env.DB_PORT || 26228,[m
[31m--    ssl: { rejectUnauthorized: false },[m
[31m--    waitForConnections: true,[m
[31m--    connectionLimit: 10,[m
[31m--    queueLimit: 0[m
[31m--});[m
[31m--[m
[31m--// Test the pool connection on start[m
[31m--db.getConnection((err, connection) => {[m
[31m--    if (err) {[m
[31m--        console.error('Database connection failed:', err.message);[m
[31m--        return;[m
[31m--    }[m
[31m--    console.log('Connected to Aiven MySQL Database successfully via Pool.');[m
[31m--    connection.release(); // Release connection back to pool[m
[31m--});[m
[31m--[m
  // ====================================================================[m
  // 🔐 Node.js Backend Login Controller (அசின்்க்ரோனஸ் எர்ரர் சரிசெய்யப்பட்டது)[m
  // ====================================================================[m
