const express = require('express');
const cors = require('cors');
const { AccessToken } = require('livekit-server-sdk');
const app = express();

const API_KEY = "APIZwAMHV9RtsLW";
const API_SECRET = "Djc7CeXf7vAwaN1HN4BbUvUXRmk2JBg2QN14YIRXE0b";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/get-token', async (req, res) => { // Mark as async
  try {
    const roomName = req.query.roomName;
    const participantName = req.query.participantName;

    if (!roomName || !participantName) {
      return res.status(400).json({ success: false, error: 'Missing required parameters: roomName and participantName' });
    }

    console.log(`Generating token for ${participantName} in room ${roomName}`);

    const token = new AccessToken(API_KEY, API_SECRET, { identity: participantName });
    console.log('Token object created:', token);

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    const jwt = await token.toJwt(); // Await the Promise
    console.log('Generated JWT after await:', jwt, 'Type:', typeof jwt);

    if (!jwt || typeof jwt !== 'string') {
      console.error('JWT generation failed - token is:', jwt, 'Type:', typeof jwt);
      return res.status(500).json({ success: false, error: 'Failed to generate token: invalid JWT format' });
    }

    console.log('Token generated successfully:', jwt);
    return res.json({ success: true, token: jwt });
  } catch (error) {
    console.error('Token generation error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: 'Failed to generate token: ' + error.message });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Token server running on port ${PORT}`);
  console.log(`Token endpoint: http://localhost:${PORT}/get-token?roomName=ROOM_NAME&participantName=PARTICIPANT_NAME`);
});