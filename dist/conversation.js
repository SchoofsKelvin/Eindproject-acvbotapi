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
        const headers = Object.assign({}, HEADERS, { Cookie: `UserId=${this.userId}`, token: this.token });
        request.post(`${DIRECT_LINE}/conversations`, { headers }, (error, response, body) => {
            // console.log('Body', typeof body, body);
            const data = parseJSON(body);
            if (!data)
                return console.error(new Error('Couldn\'t parse JSON: ' + body));
            if (error)
                return console.error(error);
            if (data.error)
                return console.error(data.error);
            const { conversationId, token, expires_in } = data;
            this.conversationId = conversationId;
            this.token = token;
            this.expiresIn = expires_in;
            this.watermark = null;
            this.emit('connected');
            this.startInterval();
        });
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
        this.timer = setInterval(() => this.update(), 1000);
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
        const headers = Object.assign({}, HEADERS, { Cookie: `UserId=${this.userId}`, token: this.token });
        request.post(url, { headers, json }, (error, response, body) => {
            // console.log('Body', typeof body, body);
            const data = parseJSON(body);
            if (!data)
                return console.error(new Error('Couldn\'t parse JSON: ' + body));
            if (error)
                return console.error(error);
            if (data.error)
                return console.error(data.error);
        });
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
        const url = `${DIRECT_LINE}/conversations/${this.conversationId}/activities?watermark=${this.watermark || ''}`;
        const headers = Object.assign({}, HEADERS, { Cookie: `UserId=${this.userId}`, token: this.token });
        request.get(url, { headers }, (error, response, body) => {
            // console.log('Body', typeof body, body);
            const data = parseJSON(body);
            if (!data)
                return console.error(new Error('Couldn\'t parse JSON: ' + body));
            if (error)
                return console.error(error);
            if (data.error)
                return console.error(data.error);
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