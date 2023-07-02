import { WebSocketGateway, OnGatewayInit } from '@nestjs/websockets';
import * as ws from 'ws';
import { v4 as uuidv4 } from 'uuid';

@WebSocketGateway()
export class WsGateway implements OnGatewayInit {
  public clients: { [key: string]: ws.WebSocket } = {};

  public requests: { [key: string]: any } = {}; // TODO: change any to a request type

  afterInit() {
    const wsServer = new ws.Server({
      port: process.env.WS_PORT || 3002,
    });

    const sendUpdatedRequestsListToEveryone = () => {
      Object.entries(this.clients).forEach((c) => {
        c[1].send(
          JSON.stringify({
            type: 'requestsList',
            requests: this.requests,
          }),
        );
      });
    };

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
            this.requests[id] = message.request;
            sendUpdatedRequestsListToEveryone();
            break;
          case 'cancelRequest':
            delete this.requests[id];
            sendUpdatedRequestsListToEveryone();
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
        delete this.clients[id];
        delete this.requests[id];
        sendUpdatedRequestsListToEveryone();
      });
    });
  }
}
