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
            const data = typeof body === 'object' ? body : JSON.parse(body);
            if (!data)
                throw new Error('Couldn\'t parse JSON');
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
            const data = typeof body === 'object' ? body : JSON.parse(body);
            if (!data)
                throw new Error('Couldn\'t parse JSON');
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
            const data = typeof body === 'object' ? body : JSON.parse(body);
            if (!data)
                throw new Error('Couldn\'t parse JSON');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udmVyc2F0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vY29udmVyc2F0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EsaUNBQWlDO0FBQ2pDLG1DQUFtQztBQUVuQyxtQ0FBc0M7QUFHdEMsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBUyxlQUFlLENBQUMsQ0FBQztBQUN4RCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFTLFFBQVEsQ0FBQyxDQUFDO0FBRTVDLE1BQU0sT0FBTyxHQUFHO0lBQ2QsTUFBTSxFQUFFLGtCQUFrQjtJQUMxQixhQUFhLEVBQUUsVUFBVSxNQUFNLEVBQUU7Q0FDbEMsQ0FBQztBQUVGOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBQ0gsa0JBQWtDLFNBQVEscUJBQVk7SUFlcEQsWUFBWSxjQUF1QjtRQUNqQyxLQUFLLEVBQUUsQ0FBQztRQVpILFdBQU0sR0FBVyxFQUFFLENBQUM7UUFDcEIsYUFBUSxHQUFXLE1BQU0sQ0FBQztRQUd6QixVQUFLLEdBQVcsRUFBRSxDQUFDO1FBQ25CLGNBQVMsR0FBVyxDQUFDLENBQUM7UUFDdEIsY0FBUyxHQUFrQixJQUFJLENBQUM7UUFFaEMsVUFBSyxHQUF3QixJQUFJLENBQUM7UUFDbEMsbUJBQWMsR0FBRyxLQUFLLENBQUM7UUFJN0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxjQUF3QixDQUFDO1FBQy9DLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQztZQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUMzQyxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ksVUFBVTtRQUNmLE1BQU0sQ0FBQyxDQUFDLEdBQUcsWUFBWSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRDs7Ozs7Ozs7T0FRRztJQUNJLE1BQU07UUFDWCxnRUFBZ0U7UUFDaEUsTUFBTSxPQUFPLHFCQUFRLE9BQU8sSUFBRSxNQUFNLEVBQUUsVUFBVSxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEdBQUUsQ0FBQztRQUNuRixPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsV0FBVyxnQkFBZ0IsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsS0FBVSxFQUFFLFFBQTBCLEVBQUUsSUFBUyxFQUFFLEVBQUU7WUFDOUcsMENBQTBDO1lBQzFDLE1BQU0sSUFBSSxHQUFHLE9BQU8sSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQztZQUNuRCxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUM7Z0JBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztnQkFBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakQsTUFBTSxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDO1lBQ25ELElBQUksQ0FBQyxjQUFjLEdBQUcsY0FBYyxDQUFDO1lBQ3JDLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1lBQ25CLElBQUksQ0FBQyxTQUFTLEdBQUcsVUFBVSxDQUFDO1lBQzVCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDdkIsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3ZCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELGtDQUFrQztJQUMzQixpQkFBaUI7UUFDdEIsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUM7SUFDN0IsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxZQUFZO1FBQ2pCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2YsYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMxQixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztZQUNsQixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3ZCLENBQUM7SUFDSCxDQUFDO0lBRUQ7Ozs7OztPQU1HO0lBQ0ksYUFBYTtRQUNsQixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDcEIsSUFBSSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxXQUFXLENBQUMsT0FBZTtRQUNoQyxNQUFNLEdBQUcsR0FBRyxHQUFHLFdBQVcsa0JBQWtCLElBQUksQ0FBQyxjQUFjLGFBQWEsQ0FBQztRQUM3RSxNQUFNLElBQUksR0FBRztZQUNYLElBQUksRUFBRSxTQUFTO1lBQ2YsSUFBSSxFQUFFLE9BQU87WUFDYixJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRTtTQUMvQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7UUFDM0IsTUFBTSxPQUFPLHFCQUFRLE9BQU8sSUFBRSxNQUFNLEVBQUUsVUFBVSxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEdBQUUsQ0FBQztRQUNuRixPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLEtBQVUsRUFBRSxRQUEwQixFQUFFLElBQVMsRUFBRSxFQUFFO1lBQ3pGLDBDQUEwQztZQUMxQyxNQUFNLElBQUksR0FBRyxPQUFPLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNoRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFBQyxNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7WUFDbkQsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDO2dCQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7Z0JBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ25ELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7Ozs7OztPQVFHO0lBQ0ksYUFBYSxDQUFDLElBQWdCLEVBQUUsb0JBQTZCO1FBQ2xFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUM7WUFBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdkMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN2RyxDQUFDO0lBRUQ7OztPQUdHO0lBQ08sTUFBTTtRQUNkLE1BQU0sR0FBRyxHQUFHLEdBQUcsV0FBVyxrQkFBa0IsSUFBSSxDQUFDLGNBQWMseUJBQXlCLElBQUksQ0FBQyxTQUFTLElBQUksRUFBRSxFQUFFLENBQUM7UUFDL0csTUFBTSxPQUFPLHFCQUFRLE9BQU8sSUFBRSxNQUFNLEVBQUUsVUFBVSxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEdBQUUsQ0FBQztRQUNuRixPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsS0FBVSxFQUFFLFFBQTBCLEVBQUUsSUFBUyxFQUFFLEVBQUU7WUFDbEYsMENBQTBDO1lBQzFDLE1BQU0sSUFBSSxHQUFHLE9BQU8sSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQztZQUNuRCxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUM7Z0JBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDdkMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztnQkFBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO1lBQ2hDLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBYyxFQUFFLEVBQUU7Z0JBQ3pDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNqQixLQUFLLFNBQVM7d0JBQ1osRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLE1BQU0sQ0FBQzs0QkFBQyxLQUFLLENBQUM7d0JBQ3ZDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQzs0QkFBQyxLQUFLLENBQUMsQ0FBQyw4REFBOEQ7d0JBQy9GLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7d0JBQ3BDLEtBQUssQ0FBQztvQkFDUjt3QkFDRSxPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixHQUFHLENBQUMsSUFBSSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ25FLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQzs7QUFySmMsd0JBQVcsR0FBRyxDQUFDLFdBQVcsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBRjlFLCtCQXdKQztBQUVEOzs7Ozs7O0dBT0c7QUFFSDs7Ozs7OztHQU9HO0FBRUg7Ozs7Ozs7R0FPRztBQUVIOzs7Ozs7Ozs7R0FTRyJ9