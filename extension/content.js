// Policy Pulse Clipper — Content Script
// Runs on bb.org.bd pages, extracts circular data from the table

(function () {
  'use strict';

  // Only activate on circular pages
  if (!window.location.pathname.includes('mediaroom/circular')) return;

  function extractCirculars() {
    const table = document.getElementById('sortableTable');
    if (!table) return [];

    const rows = table.querySelectorAll('tbody tr');
    const circulars = [];

    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return;

      const rawDate = (cells[0].textContent || '').trim();
      const title = (cells[1].textContent || '').trim();
      const engLinks = cells[2] ? Array.from(cells[2].querySelectorAll('a[href$=".pdf"]')).map((a) => a.href) : [];
      const bnLinks = cells[3] ? Array.from(cells[3].querySelectorAll('a[href$=".pdf"]')).map((a) => a.href) : [];

      // Parse date from DD/MM/YY format
      let issuedDate = null;
      if (rawDate) {
        const parts = rawDate.split('/');
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          let year = parts[2];
          if (year.length === 2) year = '20' + year;
          issuedDate = `${year}-${month}-${day}`;
        }
      }

      // Extract circular number from title (everything before the colon)
      let circularNumber = title;
      let circularTitle = title;
      const colonIdx = title.indexOf(':');
      if (colonIdx > 0) {
        circularNumber = title.substring(0, colonIdx).trim();
        circularTitle = title.substring(colonIdx + 1).trim();
      }

      // Extract department from circular number prefix
      const dept = guessDepartment(circularNumber);

      circulars.push({
        circular_number: circularNumber,
        title: circularTitle,
        issued_date: issuedDate,
        department: dept,
        pdf_url_en: engLinks[0] || null,
        pdf_url_bn: bnLinks[0] || null,
        source_url: window.location.href,
        status: 'active',
      });
    });

    return circulars;
  }

  function guessDepartment(circNum) {
    const cn = circNum.toUpperCase();
    if (cn.startsWith('BRPD-2')) return 'Banking Regulation and Policy Department-2';
    if (cn.startsWith('BRPD-1') || cn.startsWith('BRPD')) return 'Banking Regulation and Policy Department-1';
    if (cn.startsWith('DFIM')) return 'Department of Financial Institutions and Markets';
    if (cn.startsWith('FEOD')) return 'Foreign Exchange Operation Department-1';
    if (cn.startsWith('FEPD-2')) return 'Foreign Exchange Policy Department-2';
    if (cn.startsWith('FEPD')) return 'Foreign Exchange Policy Department-1';
    if (cn.startsWith('FEID')) return 'Foreign Exchange Investment Department';
    if (cn.startsWith('PSD-2')) return 'Payment Systems Department-2';
    if (cn.startsWith('PSD-1') || cn.startsWith('PSD')) return 'Payment Systems Department-1';
    if (cn.startsWith('SDAD')) return 'Supervisory Data Management and Analytics Department';
    if (cn.startsWith('SFD')) return 'Sustainable Finance Department';
    if (cn.startsWith('DCM')) return 'Department of Currency Management';
    if (cn.startsWith('MPD')) return 'Monetary Policy Department';
    if (cn.startsWith('ACD')) return 'Agricultural Credit Department-1';
    if (cn.startsWith('BFIU')) return 'Bangladesh Financial Intelligence Unit';
    if (cn.startsWith('FICSD')) return 'Financial Integrity and Customer Services Department';
    if (cn.startsWith('FSD')) return 'Financial Stability Department';
    if (cn.startsWith('FID')) return 'Financial Inclusion Department';
    if (cn.startsWith('DOSS')) return 'Department of Off-Site Supervision';
    if (cn.startsWith('SMESPD')) return 'SME & Special Programmes Department';
    if (cn.startsWith('IBRPD')) return 'Islami Banking Regulations and Policy Department';
    if (cn.startsWith('PSSD')) return 'Payment Systems Supervision Department';
    return 'Unknown';
  }

  // Expand DataTables to show all rows before extracting
  function expandTable() {
    try {
      const dt = window.jQuery && window.jQuery('#sortableTable').DataTable();
      if (dt) {
        dt.page.len(-1).draw();
        return true;
      }
    } catch (e) { /* DataTables not available */ }
    return false;
  }

  // Expose extraction to popup via message passing
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'extract') {
      expandTable();
      // Small delay to let DataTables redraw
      setTimeout(() => {
        const data = extractCirculars();
        sendResponse({ circulars: data, count: data.length });
      }, 500);
      return true; // async response
    }
    if (msg.action === 'ping') {
      sendResponse({ ok: true, onCircularPage: true });
      return true;
    }
  });
})();
