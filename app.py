import streamlit as st
import requests, base64, mimetypes, os
import gspread
from google.oauth2.service_account import Credentials

# --- CONFIGURATION --- #
VENOM_API = " "  # 🔁 Change when ngrok URL resets
SERVICE_ACCOUNT_FILE = "  "  # ✅ Keep in same folder as app.py
SHEET_URL = "  "

# --- VERIFY SERVICE ACCOUNT FILE EXISTS --- #
if not os.path.exists(SERVICE_ACCOUNT_FILE):
    st.error(f"❌ Service account file not found:\n`{SERVICE_ACCOUNT_FILE}`")
    st.stop()

# --- LOAD GROUP IDs FROM SHEET --- #
@st.cache_data
def load_group_ids():
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive"
    ]
    creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=scopes)
    client = gspread.authorize(creds)
    sheet = client.open_by_url(SHEET_URL).worksheet("GroupIDs")
    ids = sheet.col_values(2)[1:]  # Column B = Group IDs, skip header
    return [gid.strip() for gid in ids if gid.strip().endswith('@g.us')]

# --- STREAMLIT UI --- #
st.set_page_config(page_title="WhatsApp Group Broadcaster", layout="centered")
st.title("📲 WhatsApp Group Broadcaster")

message = st.text_area("📩 Message to Send", placeholder="Type your WhatsApp broadcast message here")

uploaded_files = st.file_uploader(
    "📁 Upload Media Files (images, audio, video, pdf)",
    type=["png", "jpg", "jpeg", "mp4", "mp3", "pdf"],
    accept_multiple_files=True
)

# --- ON SEND --- #
if st.button("✅ Send to WhatsApp Groups"):
    try:
        GROUP_IDS = load_group_ids()
    except Exception as e:
        st.error(f"❌ Failed to load group IDs: {e}")
        st.stop()

    if not GROUP_IDS:
        st.warning("⚠️ No WhatsApp group IDs found in Google Sheet.")
        st.stop()

    if not message and not uploaded_files:
        st.warning("⚠️ Please enter a message or upload at least one file.")
        st.stop()

    success, failed = 0, 0

    with st.spinner("📤 Sending to WhatsApp groups..."):

        # ✅ TEXT-ONLY MESSAGES
        if message and not uploaded_files:
            for group_id in GROUP_IDS:
                try:
                    payload = {"to": group_id, "message": message}
                    res = requests.post(f"{VENOM_API}/send-message", json=payload)
                    res.raise_for_status()
                    st.success(f"✅ Message sent to {group_id}")
                    success += 1
                except Exception as e:
                    st.error(f"❌ Failed to send to {group_id}: {e}")
                    failed += 1

        # ✅ MEDIA MESSAGES (optional caption)
        for file in uploaded_files:
            try:
                filename = file.name
                file_bytes = file.read()
                base64_data = base64.b64encode(file_bytes).decode("utf-8")
                mime_type, _ = mimetypes.guess_type(filename)
                mime_type = mime_type or "application/octet-stream"
                base64_uri = f"data:{mime_type};base64,{base64_data}"

                payload = {
                    "toList": GROUP_IDS,
                    "base64": base64_uri,
                    "filename": filename,
                    "caption": message
                }

                res = requests.post(f"{VENOM_API}/send-media-multi", json=payload)
                res.raise_for_status()

                result = res.json()
                st.success(f"📎 {filename} sent.")
                for r in result.get("results", []):
                    if r.get("success"):
                        success += 1
                    else:
                        failed += 1

            except Exception as e:
                st.error(f"❌ Error sending {filename}: {e}")
                failed += len(GROUP_IDS)

    # --- SUMMARY --- #
    st.markdown("### 📊 Summary Report")
    st.success(f"✅ Total successful sends: {success}")
    st.error(f"❌ Total failed sends: {failed}")




