/* excel.js - Advanced SheetJS Excel Engine orchestrator */

export const Excel = {
  // Exact 40 columns requested in the prompt
  columns: [
    "Customer",
    "Project",
    "Module",
    "Feature",
    "HD#",
    "JIRA#",
    "Epic",
    "Story",
    "Sprint",
    "Release",
    "Confluence Link",
    "PM",
    "BA",
    "Developer",
    "QA",
    "Estimated Start",
    "Estimated End",
    "Actual Start",
    "Actual End",
    "Status",
    "Completion %",
    "SOW",
    "BA Estimated",
    "BA Actual",
    "BA Remaining",
    "DEV Estimated",
    "DEV Actual",
    "DEV Remaining",
    "QA Estimated",
    "QA Actual",
    "QA Remaining",
    "Total Estimated",
    "Total Actual",
    "Total Remaining",
    "Risk",
    "Dependency",
    "Milestone",
    "Go Live",
    "Weekend",
    "Remarks"
  ],

  /**
   * Generates realistic sample rows with complete 40-column loyalty to the existing design
   */
  getSampleRows() {
    return [
      {
        "Customer": "AeroSpace Inc.",
        "Project": "Project Ares Core Upgrade",
        "Module": "Security Integration",
        "Feature": "OAuth2 Multi-factor Auth",
        "HD#": "HD-8201",
        "JIRA#": "ARES-392",
        "Epic": "EPIC-ARES-10",
        "Story": "ST-881",
        "Sprint": "Sprint 42",
        "Release": "v2.1.0-RC1",
        "Confluence Link": "https://wiki.aerospace.com/ares/oauth2",
        "PM": "John Doe",
        "BA": "Sarah Connor",
        "Developer": "Bob Johnson",
        "QA": "David Miller",
        "Estimated Start": "2026-07-01",
        "Estimated End": "2026-07-15",
        "Actual Start": "2026-07-01",
        "Actual End": "2026-07-14",
        "Status": "Completed",
        "Completion %": 100,
        "SOW": "Approved",
        "BA Estimated": 40,
        "BA Actual": 38,
        "BA Remaining": 2,
        "DEV Estimated": 120,
        "DEV Actual": 115,
        "DEV Remaining": 5,
        "QA Estimated": 60,
        "QA Actual": 58,
        "QA Remaining": 2,
        "Total Estimated": 220,
        "Total Actual": 211,
        "Total Remaining": 9,
        "Risk": "Low",
        "Dependency": "None",
        "Milestone": "Milestone 1 Completed",
        "Go Live": "2026-07-20",
        "Weekend": "No",
        "Remarks": "Delivered 1 day ahead of schedule."
      },
      {
        "Customer": "Defense Lab",
        "Project": "Zeus Security Shield Framework",
        "Module": "Cryptography Shield",
        "Feature": "AES-256 Payload Encryption",
        "HD#": "HD-9104",
        "JIRA#": "ZEUS-811",
        "Epic": "EPIC-ZEUS-02",
        "Story": "ST-302",
        "Sprint": "Sprint 43",
        "Release": "v1.5.0",
        "Confluence Link": "https://wiki.defenselab.gov/zeus/crypto",
        "PM": "Sarah Connor",
        "BA": "John Doe",
        "Developer": "Alice Smith",
        "QA": "David Miller",
        "Estimated Start": "2026-07-10",
        "Estimated End": "2026-08-05",
        "Actual Start": "2026-07-12",
        "Actual End": "",
        "Status": "In Progress",
        "Completion %": 75,
        "SOW": "Approved",
        "BA Estimated": 30,
        "BA Actual": 28,
        "BA Remaining": 2,
        "DEV Estimated": 150,
        "DEV Actual": 110,
        "DEV Remaining": 40,
        "QA Estimated": 80,
        "QA Actual": 20,
        "QA Remaining": 60,
        "Total Estimated": 260,
        "Total Actual": 158,
        "Total Remaining": 102,
        "Risk": "Medium",
        "Dependency": "AeroSpace OAuth API",
        "Milestone": "Milestone 2 In-Progress",
        "Go Live": "2026-08-15",
        "Weekend": "Yes",
        "Remarks": "Requires active weekend testing standby."
      },
      {
        "Customer": "Speedy Delivery",
        "Project": "Hermes Logistic Router API",
        "Module": "Routing Optimization",
        "Feature": "Dijkstra Core Upgrade",
        "HD#": "HD-1092",
        "JIRA#": "HERMES-482",
        "Epic": "EPIC-HERM-09",
        "Story": "ST-903",
        "Sprint": "Sprint 41",
        "Release": "v3.0.0",
        "Confluence Link": "https://wiki.speedydelivery.com/hermes/routing",
        "PM": "Alex Mercer",
        "BA": "Pam Beesly",
        "Developer": "Bob Johnson",
        "QA": "David Miller",
        "Estimated Start": "2026-06-15",
        "Estimated End": "2026-07-10",
        "Actual Start": "2026-06-15",
        "Actual End": "2026-07-10",
        "Status": "Completed",
        "Completion %": 100,
        "SOW": "Approved",
        "BA Estimated": 20,
        "BA Actual": 20,
        "BA Remaining": 0,
        "DEV Estimated": 90,
        "DEV Actual": 95,
        "DEV Remaining": 0,
        "QA Estimated": 40,
        "QA Actual": 38,
        "QA Remaining": 2,
        "Total Estimated": 150,
        "Total Actual": 153,
        "Total Remaining": 2,
        "Risk": "Low",
        "Dependency": "Google Maps API license",
        "Milestone": "Final Release Approved",
        "Go Live": "2026-07-12",
        "Weekend": "No",
        "Remarks": "Slight deviation in DEV hours approved by PM."
      },
      {
        "Customer": "Global Bank Corp.",
        "Project": "Chronos Real-time Scheduler",
        "Module": "Transaction Scheduler",
        "Feature": "Cron-Trigger Engine",
        "HD#": "HD-2210",
        "JIRA#": "CHRON-104",
        "Epic": "EPIC-CHRON-01",
        "Story": "ST-229",
        "Sprint": "Sprint 44",
        "Release": "v0.9.0",
        "Confluence Link": "https://wiki.globalbank.com/chronos",
        "PM": "Michael Scott",
        "BA": "John Doe",
        "Developer": "Alice Smith",
        "QA": "David Miller",
        "Estimated Start": "2026-07-20",
        "Estimated End": "2026-08-20",
        "Actual Start": "",
        "Actual End": "",
        "Status": "Planning",
        "Completion %": 15,
        "SOW": "Pending Client Sign-off",
        "BA Estimated": 50,
        "BA Actual": 15,
        "BA Remaining": 35,
        "DEV Estimated": 200,
        "DEV Actual": 0,
        "DEV Remaining": 200,
        "QA Estimated": 100,
        "QA Actual": 0,
        "QA Remaining": 100,
        "Total Estimated": 350,
        "Total Actual": 15,
        "Total Remaining": 335,
        "Risk": "High",
        "Dependency": "Client SOW signature",
        "Milestone": "Kickoff scheduled next Monday",
        "Go Live": "2026-09-01",
        "Weekend": "No",
        "Remarks": "Pending SOW clearance from compliance office."
      },
      {
        "Customer": "GreenField Farms",
        "Project": "Demeter Agro-Sensors Cloud",
        "Module": "Telemetry Dashboard",
        "Feature": "Soil Humidity Graphing",
        "HD#": "HD-5542",
        "JIRA#": "DEM-990",
        "Epic": "EPIC-DEM-03",
        "Story": "ST-542",
        "Sprint": "Sprint 40",
        "Release": "v1.0.0",
        "Confluence Link": "https://wiki.greenfieldfarms.com/demeter",
        "PM": "Pam Beesly",
        "BA": "Sarah Connor",
        "Developer": "Bob Johnson",
        "QA": "David Miller",
        "Estimated Start": "2026-05-10",
        "Estimated End": "2026-06-15",
        "Actual Start": "2026-05-12",
        "Actual End": "",
        "Status": "On Hold",
        "Completion %": 0,
        "SOW": "Under Draft",
        "BA Estimated": 40,
        "BA Actual": 20,
        "BA Remaining": 20,
        "DEV Estimated": 100,
        "DEV Actual": 10,
        "DEV Remaining": 90,
        "QA Estimated": 50,
        "QA Actual": 0,
        "QA Remaining": 50,
        "Total Estimated": 190,
        "Total Actual": 30,
        "Total Remaining": 160,
        "Risk": "Critical",
        "Dependency": "Hardware sensors delivery",
        "Milestone": "Phase 1 delayed by hardware supplier log",
        "Go Live": "2026-10-01",
        "Weekend": "No",
        "Remarks": "Project frozen temporarily per customer request."
      }
    ];
  },

  /**
   * Helper to verify if SheetJS is loaded properly
   */
  checkLib() {
    if (!window.XLSX) {
      console.error("SheetJS (XLSX) library is not loaded.");
      return false;
    }
    return true;
  },

  /**
   * Download project-template.xlsx with the requested 40 columns
   */
  downloadTemplate() {
    if (!this.checkLib()) return;

    try {
      const XLSX = window.XLSX;
      // Headers row with empty data rows
      const sheetData = [this.columns];
      
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      
      XLSX.utils.book_append_sheet(wb, ws, "Project Template");
      XLSX.writeFile(wb, "project-template.xlsx");
      return true;
    } catch (e) {
      console.error("Template download failed:", e);
      return false;
    }
  },

  /**
   * Download pre-populated sample-data.xlsx with all 40 columns filled beautifully
   */
  downloadSampleData() {
    if (!this.checkLib()) return;

    try {
      const XLSX = window.XLSX;
      const rows = this.getSampleRows();
      
      // Map to sheet formats matching header ordering
      const dataAOA = [this.columns];
      rows.forEach(row => {
        dataAOA.push(this.columns.map(col => row[col] !== undefined ? row[col] : ""));
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(dataAOA);
      
      XLSX.utils.book_append_sheet(wb, ws, "Sample Portfolio Data");
      XLSX.writeFile(wb, "project-sample-data.xlsx");
      return true;
    } catch (e) {
      console.error("Sample data download failed:", e);
      return false;
    }
  },

  /**
   * Export array of objects from storage back to an Excel spreadsheet
   */
  exportToExcel(data, filename = "executive_portfolio_export") {
    if (!this.checkLib()) return;

    try {
      const XLSX = window.XLSX;
      const dataAOA = [this.columns];
      
      if (Array.isArray(data) && data.length > 0) {
        data.forEach(row => {
          dataAOA.push(this.columns.map(col => row[col] !== undefined ? row[col] : ""));
        });
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(dataAOA);
      
      XLSX.utils.book_append_sheet(wb, ws, "Executive Portfolio");
      
      const safeFilename = filename.toLowerCase().replace(/[^a-z0-9]/gi, '_') + '.xlsx';
      XLSX.writeFile(wb, safeFilename);
      return true;
    } catch (e) {
      console.error("Excel export failed:", e);
      return false;
    }
  },

  /**
   * Export custom array of objects or tabular rows to CSV file format
   */
  exportToCSV(headers, data, keys, filename = "export_report") {
    if (!this.checkLib()) {
      try {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(",") + "\n";
        if (Array.isArray(data)) {
          data.forEach(row => {
            const line = keys.map(k => {
              const val = row[k] !== undefined && row[k] !== null ? String(row[k]) : "";
              return `"${val.replace(/"/g, '""')}"`;
            }).join(",");
            csvContent += line + "\n";
          });
        }
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${filename.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      } catch (e) {
        console.error("CSV Export failed:", e);
        return false;
      }
    }

    return this.exportCustomToExcel(headers, data, keys, "Data", filename);
  },

  /**
   * Generic exporter for custom data structures with headers and key mappings
   */
  exportCustomToExcel(headers, data, keys, sheetName = "Export_Data", filename = "export_report") {
    if (this.checkLib()) {
      try {
        const XLSX = window.XLSX;
        const dataAOA = [headers];

        if (Array.isArray(data) && data.length > 0) {
          data.forEach(item => {
            dataAOA.push(keys.map(k => item[k] !== undefined && item[k] !== null ? item[k] : ""));
          });
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(dataAOA);

        // Auto-fit column widths
        const colWidths = headers.map((h, i) => {
          let maxLen = h.toString().length;
          dataAOA.forEach(row => {
            const cellVal = row[i] ? row[i].toString() : "";
            if (cellVal.length > maxLen) maxLen = Math.min(cellVal.length, 50);
          });
          return { wch: maxLen + 3 };
        });
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        const safeFilename = filename.toLowerCase().replace(/[^a-z0-9]/gi, '_') + '.xlsx';
        XLSX.writeFile(wb, safeFilename);
        return true;
      } catch (e) {
        console.error("Custom Excel export failed, falling back to CSV:", e);
      }
    }

    return this.exportToCSV(headers, data, keys, filename);
  },

  /**
   * Export Enterprise Projects to Excel with a dedicated Status Legend and Import Guidelines sheet
   */
  exportProjectsWithLegend(headers, data, keys, sheetName = "Project_Registers", filename = "enterprise_projects_registers") {
    const legendAOA = [
      ["STATUS OPTION LEGEND & IMPORT GUIDELINES"],
      [""],
      ["Allowed Status Code", "Display Status Name", "Description & Usage"],
      ["in-progress", "In Progress", "Active delivery stage or ongoing sprint"],
      ["completed", "Completed", "Project deliverables successfully completed & closed"],
      ["planning", "Planning", "Initiation, scoping, requirement gathering phase"],
      ["on-hold", "On Hold", "Delivery temporarily paused or suspended"],
      ["archived", "Archived", "Project archived into historical records"],
      [""],
      ["ALLOWED RISK LEVELS", "DESCRIPTION"],
      ["Low", "Low risk exposure; standard monitoring"],
      ["Medium", "Moderate risk requiring team oversight"],
      ["High", "High risk flagged for executive escalation"],
      ["Critical", "Severe risk impacting timeline or budget"],
      [""],
      ["IMPORT & UPDATE RULES", "SPECIFICATION"],
      ["Mandatory Fields", "Project Name OR Client/Customer Name is MANDATORY."],
      ["Optional Fields", "All other columns (Manager, Developer, QA, BA, Sprint, Risk, Progress, Budget, Status, Remarks) are OPTIONAL."],
      ["Updating Existing Records", "If 'Project Code' (e.g. PRJ001) or 'Project Name' matches an existing project, the system UPDATES that project."],
      ["Blank Cells on Update", "When updating, blank/empty optional cells will preserve existing values in the system."],
      ["Creating New Records", "If 'Project Name' does not match any existing project, a NEW project is initiated automatically."]
    ];

    if (this.checkLib()) {
      try {
        const XLSX = window.XLSX;
        const dataAOA = [headers];

        if (Array.isArray(data) && data.length > 0) {
          data.forEach(item => {
            dataAOA.push(keys.map(k => {
              if (item[k] === undefined || item[k] === null) return "";
              if (k === 'status') {
                const s = String(item[k]).toLowerCase();
                if (s === 'in-progress') return 'In Progress';
                if (s === 'completed') return 'Completed';
                if (s === 'planning') return 'Planning';
                if (s === 'on-hold') return 'On Hold';
                if (s === 'archived') return 'Archived';
              }
              return item[k];
            }));
          });
        }

        const wb = XLSX.utils.book_new();

        // Sheet 1: Data
        const wsData = XLSX.utils.aoa_to_sheet(dataAOA);
        const colWidths = headers.map((h, i) => {
          let maxLen = h.toString().length;
          dataAOA.forEach(row => {
            const cellVal = row[i] ? row[i].toString() : "";
            if (cellVal.length > maxLen) maxLen = Math.min(cellVal.length, 50);
          });
          return { wch: maxLen + 3 };
        });
        wsData['!cols'] = colWidths;
        XLSX.utils.book_append_sheet(wb, wsData, sheetName);

        // Sheet 2: Legend
        const wsLegend = XLSX.utils.aoa_to_sheet(legendAOA);
        wsLegend['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 65 }];
        XLSX.utils.book_append_sheet(wb, wsLegend, "Status_Legend");

        const safeFilename = filename.toLowerCase().replace(/[^a-z0-9]/gi, '_') + '.xlsx';
        XLSX.writeFile(wb, safeFilename);
        return true;
      } catch (e) {
        console.error("Export with legend failed, falling back to CSV:", e);
      }
    }

    // CSV Fallback with appended Legend section
    try {
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(",") + "\n";
      if (Array.isArray(data)) {
        data.forEach(row => {
          const line = keys.map(k => {
            let val = row[k] !== undefined && row[k] !== null ? String(row[k]) : "";
            if (k === 'status') {
              const s = val.toLowerCase();
              if (s === 'in-progress') val = 'In Progress';
              else if (s === 'completed') val = 'Completed';
              else if (s === 'planning') val = 'Planning';
              else if (s === 'on-hold') val = 'On Hold';
              else if (s === 'archived') val = 'Archived';
            }
            return `"${val.replace(/"/g, '""')}"`;
          }).join(",");
          csvContent += line + "\n";
        });
      }

      csvContent += "\n\"--- STATUS OPTION LEGEND & IMPORT GUIDELINES ---\"\n";
      legendAOA.forEach(lRow => {
        csvContent += lRow.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",") + "\n";
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${filename.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    } catch (e) {
      console.error("CSV Export with legend failed:", e);
      return false;
    }
  },

  /**
   * Generic downloadable template generator
   */
  downloadCustomTemplate(headers, sampleRow = null, sheetName = "Template", filename = "template") {
    if (this.checkLib()) {
      try {
        const XLSX = window.XLSX;
        const dataAOA = [headers];
        if (sampleRow && Array.isArray(sampleRow)) {
          dataAOA.push(sampleRow);
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(dataAOA);

        ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 5, 15) }));
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const safeFilename = filename.toLowerCase().replace(/[^a-z0-9]/gi, '_') + '.xlsx';
        XLSX.writeFile(wb, safeFilename);
        return true;
      } catch (e) {
        console.error("Template download failed, falling back to CSV:", e);
      }
    }

    const keys = headers.map((_, i) => i);
    const dataObj = sampleRow ? [sampleRow] : [];
    return this.exportToCSV(headers, dataObj, keys, filename);
  },

  /**
   * Generic parser for custom Excel/CSV files with array buffer and CSV fallback
   */
  parseCustomExcelFile(file, callback) {
    const isCSV = file && file.name && (file.name.endsWith('.csv') || file.type === 'text/csv');

    if (!this.checkLib() || isCSV) {
      this.parseCSVFileNative(file, (csvRows, csvErr) => {
        if (csvRows && csvRows.length > 0) {
          callback(csvRows, null);
        } else if (this.checkLib()) {
          this.parseXLSXFileArrayBuffer(file, callback);
        } else {
          callback(null, csvErr || "Could not parse spreadsheet file.");
        }
      });
      return;
    }

    this.parseXLSXFileArrayBuffer(file, callback);
  },

  /**
   * Helper to parse Excel binary using ArrayBuffer and SheetJS
   */
  parseXLSXFileArrayBuffer(file, callback) {
    try {
      const XLSX = window.XLSX;
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array", cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });

          if (!rows || rows.length === 0) {
            this.parseCSVFileNative(file, callback);
            return;
          }

          callback(rows, null);
        } catch (err) {
          console.error("XLSX ArrayBuffer parse error, trying CSV fallback:", err);
          this.parseCSVFileNative(file, callback);
        }
      };

      reader.onerror = () => this.parseCSVFileNative(file, callback);
      reader.readAsArrayBuffer(file);
    } catch (e) {
      console.error("XLSX processor failed:", e);
      this.parseCSVFileNative(file, callback);
    }
  },

  /**
   * Native CSV reader fallback that works without external libraries
   */
  parseCSVFileNative(file, callback) {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length < 2) {
            callback(null, "Spreadsheet is empty or missing data rows.");
            return;
          }

          const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"' || char === "'") {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                result.push(current.trim().replace(/^["']|["']$/g, ''));
                current = '';
              } else {
                current += char;
              }
            }
            result.push(current.trim().replace(/^["']|["']$/g, ''));
            return result;
          };

          const headers = parseCSVLine(lines[0]);
          const rows = [];
          for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length === 0 || (values.length === 1 && !values[0])) continue;
            const rowObj = {};
            headers.forEach((h, idx) => {
              if (h) rowObj[h] = values[idx] !== undefined ? values[idx] : '';
            });
            rows.push(rowObj);
          }

          if (rows.length === 0) {
            callback(null, "No valid data rows found in spreadsheet.");
            return;
          }

          callback(rows, null);
        } catch (err) {
          callback(null, "Spreadsheet parsing error: " + err.message);
        }
      };
      reader.onerror = () => callback(null, "FileReader failed to load file.");
      reader.readAsText(file);
    } catch (err) {
      callback(null, "File reader error: " + err.message);
    }
  },

  /**
   * Parses an excel / csv file using SheetJS and passes rows to the callback
   */
  parseExcelFile(file, callback) {
    if (!this.checkLib()) {
      callback(null, "SheetJS library not ready.");
      return;
    }

    try {
      const XLSX = window.XLSX;
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, { type: "binary" });
          
          // Use first worksheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Parse as header-based json objects
          const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
          
          if (!rows || rows.length === 0) {
            callback(null, "Spreadsheet is empty.");
            return;
          }

          // Clean up row keys and enforce validation of column layout
          const normalizedRows = rows.map(rawRow => {
            const cleanRow = {};
            this.columns.forEach(col => {
              // Exact match or fallback-case insensitive matching
              const rawKey = Object.keys(rawRow).find(k => k.trim().toLowerCase() === col.trim().toLowerCase());
              cleanRow[col] = rawKey ? rawRow[rawKey] : "";
            });
            return cleanRow;
          });

          callback(normalizedRows, null);
        } catch (err) {
          console.error("Parsing spreadsheet failed:", err);
          callback(null, "Parsing failed. Ensure file is not corrupt.");
        }
      };

      reader.onerror = () => {
        callback(null, "FileReader failed to load file.");
      };

      reader.readAsBinaryString(file);
    } catch (e) {
      console.error("Excel upload file processor failed:", e);
      callback(null, "File processing error.");
    }
  }
};
