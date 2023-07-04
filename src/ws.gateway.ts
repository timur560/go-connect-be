import { WebSocketGateway, OnGatewayInit } from '@nestjs/websockets';
import * as ws from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const HEARTBEAT_INTERVAL = 10000; // 10 seconds
const HEARTBEAT_MESSAGE = { type: 'heartbeat' };

@WebSocketGateway()
export class WsGateway implements OnGatewayInit {
  public clients: { [key: string]: ws.WebSocket } = {};

  public requests: { [key: string]: any } = {}; // TODO: change any to a request type

  private dfHeartbeatTimers: { [key: string]: any } = {};

  afterInit() {
    let server, wsServer;

    if (process.env.KEY_PATH && process.env.CERT_PATH) {
      server = createServer({
        cert: readFileSync(process.env.CERT_PATH),
        key: readFileSync(process.env.KEY_PATH),
      });
      wsServer = new ws.WebSocketServer({ server });
    } else {
      console.log('No certificates found.');

      wsServer = new ws.Server({
        port: process.env.WS_PORT || 3002,
      });
    }

    wsServer.on('connection', (ws, req) => {
      // console.log('new client connected');
      const id = uuidv4();
      ws.send(JSON.stringify({ type: 'setId', id }));
      this.clients[id] = ws;
      ws.send(
        JSON.stringify({ type: 'requestsList', requests: this.requests }),
      );
      ws.on('message', async (data: string) => {
        const message = JSON.parse(data);
        // console.log(`incoming message from ${id}`, message);

        switch (message.type) {
          case 'createRequest':
            this.requests[id] = {
              ...message.request,
              createdAt: new Date(),
            };
            this.sendUpdatedRequestsListToEveryone();
            break;
          case 'cancelRequest':
            delete this.requests[id];
            this.sendUpdatedRequestsListToEveryone();
            break;
          case 'chatMessage':
            // type, recipientId, senderId, senderName, text
            if (message.recipientId && this.clients[message.recipientId]) {
              this.clients[message.recipientId].send(JSON.stringify(message));
            }
            break;
        }
      });

      ws.on('close', () => {
        this.deleteClient(id);
      });

      ws.on('error', () => {
        this.deleteClient(id);
      });

      this.dfHeartbeatTimers[id] = setInterval(() => {
        ws.send(JSON.stringify(HEARTBEAT_MESSAGE));
      }, HEARTBEAT_INTERVAL);
    });

    if (server) {
      server.listen(process.env.WS_PORT || 3002);
    }
  }

  private sendUpdatedRequestsListToEveryone() {
    Object.entries(this.clients).forEach((c) => {
      c[1].send(
        JSON.stringify({
          type: 'requestsList',
          requests: this.requests,
        }),
      );
    });
  }

  private deleteClient(id: string) {
    delete this.clients[id];
    delete this.requests[id];
    this.sendUpdatedRequestsListToEveryone();
    if (this.dfHeartbeatTimers[id]) {
      clearInterval(this.dfHeartbeatTimers[id]);
    }
  }
}
