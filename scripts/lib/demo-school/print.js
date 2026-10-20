import fs from "node:fs";
import path from "node:path";

/* Every seeded account (the administrator first), as rows */
const rowsOf = ({ admin, accounts }) => [{ role: "ADMIN", note: "School administrator", ...admin }, ...accounts];

/* The sign-in sheet printed after seeding: one row per account, grouped by role */
export const printAccounts = ({ school, admin, password, accounts, academicYear }) => {
  const rows = rowsOf({ admin, accounts });
  const width = key => Math.max(...rows.map(row => (row[key] ?? "").length));
  const [role, name, email] = [width("role"), width("name"), width("email")];
  console.log(`School code: ${school.code}   Password (every account): ${password}`);
  console.log(`Academic year: ${academicYear.name} (${academicYear.startDate} to ${academicYear.endDate})\n`);
  for (const row of rows)
    console.log(`${row.role.padEnd(role)}  ${row.name.padEnd(name)}  ${row.email.padEnd(email)}  ${row.note ?? ""}`);
  console.log(
    `\nSign in: POST /api/v1/auth/login {"schoolCode":"${school.code}","email":"<email>","password":"${password}"}`
  );
};

/* The same accounts as a Markdown file, with their ids. The ids are made fresh on every
   run, so the file is rewritten each time (and kept out of git). -> the file's path */
export const writeAccountsFile = (file, { school, admin, password, accounts, academicYear, databases }) => {
  const rows = rowsOf({ admin, accounts });
  const counts = Object.entries(Object.groupBy(rows, row => row.role)).map(
    ([role, list]) => `| ${role} | ${list.length} |`
  );
  const cell = value => (value ?? "").toString().replaceAll("|", "\\|");
  const lines = [
    `# Demo accounts: ${school.name} (${school.code})`,
    "",
    `Generated ${new Date().toISOString()} by the demo seed. ${databases}`,
    "The ids below belong to this run only: seeding again makes new ones and rewrites this file.",
    "",
    `- **School code:** \`${school.code}\``,
    `- **Password (every account):** \`${password}\``,
    `- **Academic year:** ${academicYear.name} (${academicYear.startDate} to ${academicYear.endDate})`,
    `- **Sign in:** \`POST /api/v1/auth/login {"schoolCode":"${school.code}","email":"<email>","password":"${password}"}\``,
    "",
    "**User ID** is the account (`/users/:userId`, the JWT's `userId`). **Profile ID** is the role's own record",
    "(`/users/teachers/:teacherId`, `/users/students/:studentId`, `/users/parents/:parentId`, `/users/staff/:staffId`).",
    "",
    "| Role | Accounts |",
    "|---|---|",
    ...counts,
    `| **Total** | **${rows.length}** |`,
    "",
    "| # | Role | Name | Email | Password | User ID | Profile ID | Code | Notes |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (row, i) =>
        `| ${i + 1} | ${row.role} | ${cell(row.name)} | ${cell(row.email)} | \`${password}\` | \`${row.userId}\` | ${row.profileId ? `\`${row.profileId}\`` : "–"} | ${cell(row.code) || "–"} | ${cell(row.note)} |`
    ),
    ""
  ];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join("\n"));
  return file;
};
