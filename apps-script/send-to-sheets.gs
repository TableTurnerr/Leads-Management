// Apps Script webhook for the "Send to Sheets" feature.
//
// 1. Open https://script.google.com and create a new project.
// 2. Paste this file's contents into Code.gs.
// 3. Set SPREADSHEET_ID and SHEET_NAME below (or leave SPREADSHEET_ID blank
//    to write to the spreadsheet the script is bound to).
// 4. Deploy:  Deploy > New deployment > Type: Web app
//      - Execute as: Me
//      - Who has access: Anyone (or "Anyone with the link" if you want a soft secret)
//    Copy the resulting /exec URL and paste it into the app's Settings page.
//
// The app POSTs JSON like:
//   { sentAt: "...", sentBy: "you@example.com", rows: [ {id, name, address, ...}, ... ] }
// Each row is appended as one spreadsheet row. The first time it runs, the
// header row is written from the keys of the first row.

const SPREADSHEET_ID = ""; // leave blank to use the bound spreadsheet
const SHEET_NAME = "Leads";

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const rows = body.rows || [];
    if (!rows.length) {
      return _json({ ok: false, error: "no rows" });
    }

    const ss = SPREADSHEET_ID
      ? SpreadsheetApp.openById(SPREADSHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      return _json({ ok: false, error: "no spreadsheet bound and no SPREADSHEET_ID set" });
    }

    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

    const headers = Object.keys(rows[0]);
    const extraHeaders = ["sentAt", "sentBy"];
    const fullHeaders = [...extraHeaders, ...headers];

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(fullHeaders);
    }

    const values = rows.map((r) => [
      body.sentAt || new Date().toISOString(),
      body.sentBy || "",
      ...headers.map((h) => (r[h] === null || r[h] === undefined ? "" : r[h])),
    ]);

    sheet
      .getRange(sheet.getLastRow() + 1, 1, values.length, fullHeaders.length)
      .setValues(values);

    return _json({ ok: true, appended: rows.length });
  } catch (err) {
    return _json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
