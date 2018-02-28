"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = require("config");
const request = require("request");
const events_1 = require("events");
const DIRECT_LINE = config.get('directLineUrl');
const SECRET = config.get('secret');
const HEADERS = {
    Accept: 'application/json',
    Authorization: `Bearer ${SECRET}`,
};
function parseJSON(json) {
    if (typeof json === 'object')
        return json;
    try {
        return JSON.parse(json);
    }
    catch (e) {
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
class Conversation extends events_1.EventEmitter {
    constructor(conversationId) {
        super();
        this.userId = '';
        this.userName = 'user';
        this.token = '';
        this.expiresIn = 0;
        this.watermark = null;
        this.timer = null;
        this.hasSentMessage = false;
        this.conversationId = conversationId;
        if (conversationId)
            this.startInterval();
    }
    /**
     * Returns an array with all known events
     * @returns ['connected', 'started', 'stopped', 'message']
     */
    eventNames() {
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
    create() {
        // TODO: Clear current conversation (and interval) if one exists
        let tries = 3;
        const headers = Object.assign({}, HEADERS, { Cookie: `UserId=${this.userId}`, token: this.token });
        const doRequest = () => tries-- && request.post(`${DIRECT_LINE}/conversations`, { headers }, (error, response, body) => {
            // console.log('Body', typeof body, body);
            if (error)
                return (console.error(`Tries=${tries}`, error), doRequest());
            const data = parseJSON(body);
            if (!data)
                return (console.error(`Tries=${tries}`, new Error('Couldn\'t parse JSON: ' + body)), doRequest());
            if (data.error)
                return (console.error(`Tries=${tries}`, data.error), doRequest());
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
    getConversationId() {
        return this.conversationId;
    }
    /**
     * Stops this Conversation object polling activities from the bot
     *
     * @fires Conversation#stopped
     */
    stopInterval() {
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
    startInterval() {
        this.stopInterval();
        this.timer = setInterval(() => this.update(), 2000);
        this.emit('started');
    }
    /**
     * Sends a message to the conversation
     *
     * @param message The message to send to the bot as part of the conversation
     */
    sendMessage(message) {
        const url = `${DIRECT_LINE}/conversations/${this.conversationId}/activities`;
        const json = {
            type: 'message',
            text: message,
            from: { id: this.userId, name: this.userName },
        };
        this.hasSentMessage = true;
        let tries = 1;
        const headers = Object.assign({}, HEADERS, { Cookie: `UserId=${this.userId}`, token: this.token });
        const doRequest = () => tries-- && request.post(url, { headers, json }, (error, response, body) => {
            // console.log('Body', typeof body, body);
            if (error)
                return (console.error(`Tries=${tries}`, error), doRequest());
            const data = parseJSON(body);
            if (!data)
                return (console.error(`Tries=${tries}`, new Error('Couldn\'t parse JSON: ' + body)), doRequest());
            if (data.error)
                return (console.error(`Tries=${tries}`, data.error), doRequest());
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
    whenConnected(func, delayForFirstMessage) {
        if (this.conversationId)
            return func();
        this.once('connected', () => delayForFirstMessage ? setTimeout(func, delayForFirstMessage) : func());
    }
    /**
     * Internal function that polls for activities
     * Called by the interval started with startInterval
     */
    update() {
        let tries = 1;
        const url = `${DIRECT_LINE}/conversations/${this.conversationId}/activities?watermark=${this.watermark || ''}`;
        const headers = Object.assign({}, HEADERS, { Cookie: `UserId=${this.userId}`, token: this.token });
        const doRequest = () => tries-- && request.get(url, { headers }, (error, response, body) => {
            // console.log('Body', typeof body, body);
            if (error)
                return (console.error(`Tries=${tries}`, error), doRequest());
            const data = parseJSON(body);
            if (!data)
                return (console.error(`Tries=${tries}`, new Error('Couldn\'t parse JSON: ' + body)), doRequest());
            if (data.error)
                return (console.error(`Tries=${tries}`, data.error), doRequest());
            this.watermark = data.watermark;
            data.activities.forEach((act) => {
                switch (act.type) {
                    case 'message':
                        if (act.from.id === this.userId)
                            break;
                        if (!this.hasSentMessage)
                            break; // Wait until the user sends something (artificially delayed?)
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
Conversation.EVENT_NAMES = ['connected', 'started', 'stopped', 'message'];
exports.default = Conversation;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udmVyc2F0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vY29udmVyc2F0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EsaUNBQWlDO0FBQ2pDLG1DQUFtQztBQUVuQyxtQ0FBc0M7QUFHdEMsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBUyxlQUFlLENBQUMsQ0FBQztBQUN4RCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFTLFFBQVEsQ0FBQyxDQUFDO0FBRTVDLE1BQU0sT0FBTyxHQUFHO0lBQ2QsTUFBTSxFQUFFLGtCQUFrQjtJQUMxQixhQUFhLEVBQUUsVUFBVSxNQUFNLEVBQUU7Q0FDbEMsQ0FBQztBQUVGLG1CQUFtQixJQUFZO0lBQzdCLEVBQUUsQ0FBQyxDQUFDLE9BQU8sSUFBSSxLQUFLLFFBQVEsQ0FBQztRQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDMUMsSUFBSSxDQUFDO1FBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDMUIsQ0FBQztJQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDWCxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUM7QUFFRDs7Ozs7Ozs7Ozs7Ozs7OztHQWdCRztBQUNILGtCQUFrQyxTQUFRLHFCQUFZO0lBZXBELFlBQVksY0FBdUI7UUFDakMsS0FBSyxFQUFFLENBQUM7UUFaSCxXQUFNLEdBQVcsRUFBRSxDQUFDO1FBQ3BCLGFBQVEsR0FBVyxNQUFNLENBQUM7UUFHekIsVUFBSyxHQUFXLEVBQUUsQ0FBQztRQUNuQixjQUFTLEdBQVcsQ0FBQyxDQUFDO1FBQ3RCLGNBQVMsR0FBa0IsSUFBSSxDQUFDO1FBRWhDLFVBQUssR0FBd0IsSUFBSSxDQUFDO1FBQ2xDLG1CQUFjLEdBQUcsS0FBSyxDQUFDO1FBSTdCLElBQUksQ0FBQyxjQUFjLEdBQUcsY0FBd0Is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