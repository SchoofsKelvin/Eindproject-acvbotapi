
import * as config from 'config';
import * as request from 'request';

import { EventEmitter } from 'events';
import { IActivity, INameAndId } from './activity';

const DIRECT_LINE = config.get<string>('directLineUrl');
const USER_ID = config.get<string>('userId');
const SECRET = config.get<string>('secret');

const HEADERS = {
  Accept: 'application/json',
  Authorization: `Bearer ${SECRET}`,
};

export default class Conversation extends EventEmitter {

  private static EVENT_NAMES = ['connected', 'started', 'stopped', 'message'];

  public userId: string = '';
  public userName: string = 'user';

  private conversationId: string;
  private token: string = '';
  private expiresIn: number = 0;
  private watermark: number | null = null;

  private timer: NodeJS.Timer | null = null;
  private hasSentMessage = false;

  constructor(conversationId?: string) {
    super();
    this.conversationId = conversationId as string;
    if (conversationId) this.startInterval();
  }

  public eventNames() {
    return [...Conversation.EVENT_NAMES];
  }

  public create() {
    // TODO: Clear current conversation (and interval) if one exists
    const headers = { ...HEADERS, Cookie: `UserId=${this.userId}`, token: this.token };
    request.post(`${DIRECT_LINE}/conversations`, { headers }, (error: any, response: request.Response, body: any) => {
      // console.log('Body', typeof body, body);
      const data = typeof body === 'object' ? body : JSON.parse(body);
      if (!data) throw new Error('Couldn\'t parse JSON');
      if (error) return console.error(error);
      if (data.error) return console.error(data.error);
      const { conversationId, token, expires_in } = data;
      this.conversationId = conversationId;
      this.token = token;
      this.expiresIn = expires_in;
      this.watermark = null;
      this.emit('connected');
      this.startInterval();
    });
  }

  public stopInterval() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.emit('stopped');
    }
  }

  public startInterval() {
    this.stopInterval();
    this.timer = setInterval(() => this.update(), 1000);
    this.emit('started');
  }

  public sendMessage(message: string) {
    const url = `${DIRECT_LINE}/conversations/${this.conversationId}/activities`;
    const json = {
      type: 'message',
      text: message,
      from: { id: this.userId, name: this.userName },
    };
    this.hasSentMessage = true;
    const headers = { ...HEADERS, Cookie: `UserId=${this.userId}`, token: this.token };
    request.post(url, { headers, json }, (error: any, response: request.Response, body: any) => {
      // console.log('Body', typeof body, body);
      const data = typeof body === 'object' ? body : JSON.parse(body);
      if (!data) throw new Error('Couldn\'t parse JSON');
      if (error) return console.error(error);
      if (data.error) return console.error(data.error);
    });
  }

  public whenConnected(func: () => void, delayForFirstMessage?: number) {
    if (this.conversationId) return func();
    this.once('connected', () => delayForFirstMessage ? setTimeout(func, delayForFirstMessage) : func());
  }

  protected update() {
    const url = `${DIRECT_LINE}/conversations/${this.conversationId}/activities?watermark=${this.watermark || ''}`;
    const headers = { ...HEADERS, Cookie: `UserId=${this.userId}`, token: this.token };
    request.get(url, { headers }, (error: any, response: request.Response, body: any) => {
      // console.log('Body', typeof body, body);
      const data = typeof body === 'object' ? body : JSON.parse(body);
      if (!data) throw new Error('Couldn\'t parse JSON');
      if (error) return console.error(error);
      if (data.error) return console.error(data.error);
      this.watermark = data.watermark;
      data.activities.forEach((act: IActivity) => {
        switch (act.type) {
          case 'message':
            if (act.from.id === this.userId) break;
            if (!this.hasSentMessage) break; // Wait until the user sends something (artificially delayed?)
            this.emit('message', act.text, act);
            break;
          default:
            console.error(`Can't handle activity type' ${act.type}'`, act);
        }
      });
    });
  }
}
