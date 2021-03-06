
import * as config from 'config';
import * as request from 'request';

import { EventEmitter } from 'events';
import { IActivity, INameAndId } from './activity';

const DIRECT_LINE = config.get<string>('directLineUrl');
const SECRET = config.get<string>('secret');

const HEADERS = {
  Accept: 'application/json',
  Authorization: `Bearer ${SECRET}`,
};

function parseJSON(json: string) {
  if (typeof json === 'object') return json;
  try {
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

/**
 * Represents a conversation with the bot
 *
 * To make use of a Conversation object:
 * - Make sure conversationId is set (constructor parameter) and call startInterval()
 * - Call create() to create a new conversation with the bot
 *
 * Use stopInterval() to stop fetching activities from the bot (but messages can still be send)
 *
 * Doesn't handle the conversation timing out yet
 *
 * Events:
 * - connected(): Emitted when the a conversation is succesfully created after calling create()
 * - started(): Emitted when the bot starts polling activities (startInterval/create)
 * - stopped(): Emitted when the bot stops polling activities (stopInterval or indirectly by startInterval/create)
 * - message(text: string, activity: {@IActivity}): Emitted when the bot receives a message
 */
export default class Conversation extends EventEmitter {

  private static EVENT_NAMES = ['connected', 'started', 'stopped', 'message'];

  public userId: string = '';
  public userName: string = 'user';

  private conversationId: string;
  private token: string = '';
  private expiresIn: number = 0;
  private watermark: number | null = null;

  private timer: NodeJS.Timer | null = null;
  private lastUpdate: [number, number] = [0, 0];
  private hasSentMessage = false;

  constructor(conversationId?: string) {
    super();
    this.conversationId = conversationId as string;
    if (conversationId) this.startInterval();
  }

  /**
   * Returns an array with all known events
   * @returns ['connected', 'started', 'stopped', 'message']
   */
  public eventNames() {
    return [...Conversation.EVENT_NAMES];
  }

  /**
   * Sends a request to the bot to create a new conversation
   * This conversation's conversationId will be set on success
   * On success, the 'connected' event will also be emitted
   *
   * Calls startInterval() after the 'connected' event is emitted
   *
   * @fires Conversation#connected
   */
  public create() {
    // TODO: Clear current conversation (and interval) if one exists
    let tries = 3;
    const headers = { ...HEADERS, Cookie: `UserId=${this.userId}`, token: this.token };
    const doRequest: () => void = () => tries-- && request.post(`${DIRECT_LINE}/conversations`, { headers }, (error: any, response: request.Response, body: any) => {
      // console.log('Body', typeof body, body);
      if (error) return (console.error(`Tries=${tries}`, error), doRequest());
      const data = parseJSON(body);
      if (!data) return (console.error(`Tries=${tries}`, new Error('Couldn\'t parse JSON: ' + body)), doRequest());
      if (data.error) return (console.error(`Tries=${tries}`, data.error), doRequest());
      const { conversationId, token, expires_in } = data;
      this.conversationId = conversationId;
      this.token = token;
      this.expiresIn = expires_in;
      this.watermark = null;
      this.emit('connected');
      this.startInterval();
    });
    doRequest();
  }

  /** @returns The conversationId */
  public getConversationId() {
    return this.conversationId;
  }

  /**
   * Stops this Conversation object polling activities from the bot
   *
   * @fires Conversation#stopped
   */
  public stopInterval() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.emit('stopped');
    }
  }

  /**
   * Starts this Conversation object polling activities from the bot
   *
   * Calls stopInterval() internally first
   *
   * @fires Conversation#started
   */
  public startInterval() {
    this.stopInterval();
    this.timer = setInterval(() => this.update(), 2000);
    this.lastUpdate = process.hrtime();
    this.emit('started');
  }

  /**
   * Sends a message to the conversation
   *
   * @param message The message to send to the bot as part of the conversation
   */
  public sendMessage(message: string) {
    const url = `${DIRECT_LINE}/conversations/${this.conversationId}/activities`;
    const json = {
      type: 'message',
      text: message,
      from: { id: this.userId, name: this.userName },
    };
    this.hasSentMessage = true;
    this.startInterval();
    let tries = 1;
    const headers = { ...HEADERS, Cookie: `UserId=${this.userId}`, token: this.token };
    const doRequest: () => void = () => tries-- && request.post(url, { headers, json }, (error: any, response: request.Response, body: any) => {
      // console.log('Body', typeof body, body);
      if (error) return (console.error(`Tries=${tries}`, error), doRequest());
      const data = parseJSON(body);
      if (!data) return (console.error(`Tries=${tries}`, new Error('Couldn\'t parse JSON: ' + body)), doRequest());
      if (data.error) return (console.error(`Tries=${tries}`, data.error), doRequest());
    });
    doRequest();
  }

  /**
   * Fires the given function when the conversation is connected
   *
   * If we're already connected, the function is immediatly called.
   * Otherwise it'll wait for the connected event, wait {delayForFirstMessage} milliseconds and then call the function
   *
   * @param func The function to be called
   * @param delayForFirstMessage How many milliseconds to wait after being connected
   */
  public whenConnected(func: () => void, delayForFirstMessage?: number) {
    if (this.conversationId) return func();
    this.once('connected', () => delayForFirstMessage ? setTimeout(func, delayForFirstMessage) : func());
  }

  /**
   * Internal function that polls for activities
   * Called by the interval started with startInterval
   */
  protected update() {
    const time = process.hrtime(this.lastUpdate);
    if (time[0] > 30) this.stopInterval();
    let tries = 1;
    const url = `${DIRECT_LINE}/conversations/${this.conversationId}/activities?watermark=${this.watermark || ''}`;
    const headers = { ...HEADERS, Cookie: `UserId=${this.userId}`, token: this.token };
    const doRequest: () => void = () => tries-- && request.get(url, { headers }, (error: any, response: request.Response, body: any) => {
      // console.log('Body', typeof body, body);
      if (error) return (console.error(`Tries=${tries}`, error), doRequest());
      const data = parseJSON(body);
      if (!data) return (console.error(`Tries=${tries}`, new Error('Couldn\'t parse JSON: ' + body)), doRequest());
      if (data.error) return (console.error(`Tries=${tries}`, data.error), doRequest());
      this.watermark = data.watermark;
      if (!data.activities.length) return;
      this.startInterval();
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
    doRequest();
  }
}

/**
 * Connected event.
 *
 * Emitted when the a conversation is succesfully created after calling create()
 *
 * @event Conversation#connected
 * @type {object}
 */

/**
 * Started event.
 *
 * Emitted when the bot starts polling activities (startInterval/create)
 *
 * @event Conversation#started
 * @type {object}
 */

/**
 * Stopped event.
 *
 * Emitted when the bot stops polling activities (stopInterval or indirectly by startInterval/create)
 *
 * @event Conversation#stopped
 * @type {object}
 */

/**
 * Message event.
 *
 * message(text: string, activity: {@IActivity}): Emitted when the bot receives a message
 *
 * @event Conversation#message
 * @type {object}
 * @property {string} text: The message we received (can be empty/null/undefined)
 * @property {IActivity} activity: The activity this message is part of
 */
