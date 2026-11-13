/** Keep every saved department linked, regardless of which workflow writes it. */
export function ensureDepartmentDirectory(database) {
  database.exec('SAVEPOINT department_directory');
  try {
    for (const table of ['assets', 'loans', 'employees']) {
      const insert = (value) => `INSERT INTO departments (id, name)
        SELECT 'dept-' || lower(hex(randomblob(16))), TRIM(${value})
        WHERE TRIM(COALESCE(${value}, '')) <> ''
          AND NOT EXISTS (SELECT 1 FROM departments WHERE LOWER(TRIM(name)) = LOWER(TRIM(${value})));`;
      for (const event of ['INSERT', 'UPDATE OF department']) {
        const suffix = event === 'INSERT' ? 'insert' : 'update';
        database.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_department_${suffix}
          AFTER ${event} ON ${table} BEGIN ${insert('NEW.department')} END;`);
      }
      for (const row of database.prepare(`SELECT DISTINCT TRIM(department) AS department FROM ${table} WHERE TRIM(COALESCE(department, '')) <> ''`).all()) {
        database.prepare(`INSERT INTO departments (id, name) SELECT 'dept-' || lower(hex(randomblob(16))), ?
          WHERE NOT EXISTS (SELECT 1 FROM departments WHERE LOWER(TRIM(name)) = LOWER(?))`).run(row.department, row.department.toLowerCase());
      }
    }
    database.exec('RELEASE SAVEPOINT department_directory');
  } catch (error) {
    database.exec('ROLLBACK TO SAVEPOINT department_directory; RELEASE SAVEPOINT department_directory');
    throw error;
  }
}

export function departmentReferences(database, name) {
  return ['assets', 'loans', 'employees'].reduce((total, table) => total + database.prepare(
    `SELECT COUNT(*) AS count FROM ${table} WHERE LOWER(TRIM(department)) = LOWER(TRIM(?))`,
  ).get(name).count, 0);
}
