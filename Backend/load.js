const xlsx = require("xlsx");
const workbook = xlsx.readFile("Classified_Small_SMES_UPDATED.xlsx");

const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const data = xlsx.utils.sheet_to_json(sheet);

console.log("Total rows:", data.length);

console.log("Sample data:", data[0]);