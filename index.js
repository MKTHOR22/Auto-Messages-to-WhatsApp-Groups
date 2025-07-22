const venom = require('venom-bot');
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('./fresh-heuristic-466318-q6-34ff0681a909.json');

const SHEET_ID = '1XEBjaVJUxju2Od9z1GGRzPWf_UwZMHfAqY2A4bvXOOQ';
const SHEET_TAB = 'GroupIDs';
let client; // ✅ Global WhatsApp client for API use

// ✅ Save groups to Google Sheet
async function saveGroupsToGoogleSheet(groups) {
  console.log('\n📤 Saving to Google Sheets...');
  const doc = new GoogleSpreadsheet(SHEET_ID);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();

  const sheet = doc.sheetsByTitle[SHEET_TAB];
  if (!sheet) {
    console.error(`❌ Sheet tab "${SHEET_TAB}" not found.`);
    return;
  }

  await sheet.loadHeaderRow();
  const existingRows = await sheet.getRows();
  const existingIDs = new Set(existingRows.map(row => row['Group ID']));

  const newRows = groups.filter(group => !existingIDs.has(group.GroupID));
  console.log('📤 Data to Save:', newRows);

  if (newRows.length === 0) {
    console.log('ℹ️ No new group IDs to add.\n');
    return;
  }

  for (const group of newRows) {
    await sheet.addRow({
      'Group Name': group.GroupName,
      'Group ID': group.GroupID
    });
  }

  console.log('✅ Google Sheets update complete.\n');
}

// ✅ Extract Group Name + ID
async function extractGroups(client, chatList) {
  const groupChats = chatList.filter(chat =>
    typeof chat.id === 'object' &&
    typeof chat.id._serialized === 'string' &&
    chat.id._serialized.endsWith('@g.us')
  );

  const groupData = [];

  for (const chat of groupChats) {
    const chatDetails = await client.getChatById(chat.id._serialized);
    groupData.push({
      GroupName: chatDetails.name || 'Unnamed',
      GroupID: chatDetails.id._serialized
    });
  }

  console.log('\n📦 Groups Found:\n');
  groupData.forEach((group, index) => {
    console.log(`${index + 1}. ${group.GroupName} | ID: ${group.GroupID}`);
  });

  return groupData;
}

// ✅ Main Start Function
async function start() {
  try {
    client = await venom.create({
      session: 'whatsapp-bot',
      headless: 'new',
    });

    console.log('✅ Bot connected successfully!');
    const chats = await client.getAllChats();
    console.log(`\n🧪 Total Chats Fetched: ${chats.length}`);

    const groupList = await extractGroups(client, chats);
    await saveGroupsToGoogleSheet(groupList);

    console.log('🚀 Ready for automation...');
    startApiServer(); // ✅ Start Express after bot ready

  } catch (error) {
    console.error('❌ Error launching Venom-Bot:', error);
  }
}

// ✅ Express API Server
function startApiServer() {
  const app = express();
  const port = 3000;
  app.use(express.json({ limit: '25mb' }));

  // 🔹 Health Check Endpoint
  app.get('/status', (req, res) => {
    if (client) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'initializing' });
    }
  });

  // 🔹 Send Text Message (Single Group)
  app.post('/send-message', async (req, res) => {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ success: false, error: 'Missing `to` or `message` field.' });
    }

    try {
      await client.sendText(to, message);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 🔹 Send Media (Single Group)
  app.post('/send-media', async (req, res) => {
    const { to, base64, filename, caption } = req.body;

    if (!to || !base64 || !filename) {
      return res.status(400).json({ success: false, error: 'Missing required fields: to/base64/filename' });
    }

    try {
      await client.sendFileFromBase64(to, base64, filename, caption || '');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 🔹 Send Media to Multiple Groups
  app.post('/send-media-multi', async (req, res) => {
    const { toList, base64, filename, caption } = req.body;

    if (!Array.isArray(toList) || !base64 || !filename) {
      return res.status(400).json({ success: false, error: 'Missing toList/base64/filename' });
    }

    const results = [];

    for (const groupId of toList) {
      try {
        if (!groupId.endsWith('@g.us')) {
          throw new Error('Invalid group ID');
        }

        await client.sendFileFromBase64(groupId, base64, filename, caption || '');
        results.push({ groupId, success: true });
      } catch (err) {
        results.push({ groupId, success: false, error: err.message });
      }
    }

    res.json({ success: true, results });
  });

  app.listen(port, () => {
    console.log(`\n✅ Express API running on http://localhost:${port}`);
  });
}

start();






























