import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { authRouter } from './routes/auth';
import { environmentsRouter } from './routes/environments';
import { testPlansRouter } from './routes/testPlans';
import { recordingRouter } from './routes/recording';
import { setupRecordingSocket } from './ws/recordingSocket';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/environments', environmentsRouter);
app.use('/api/test-plans', testPlansRouter);
app.use('/api/recording', recordingRouter);

setupRecordingSocket(server);

// Serve client build in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Test Builder server running on http://localhost:${PORT}`);
});
