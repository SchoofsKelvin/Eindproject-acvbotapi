/// <reference types="node" />
import { EventEmitter } from 'events';
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
    private static EVENT_NAMES;
    userId: string;
    userName: string;
    private conversationId;
    private token;
    private expiresIn;
    private watermark;
    private timer;
    private hasSentMessage;
    constructor(conversationId?: string);
    /**
     * Returns an array with all known events
     * @returns ['connected', 'started', 'stopped', 'message']
     */
    eventNames(): string[];
    /**
     * Sends a request to the bot to create a new conversation
     * This conversation's conversationId will be set on success
     * On success, the 'connected' event will also be emitted
     *
     * Calls startInterval() after the 'connected' event is emitted
     *
     * @fires Conversation#connected
     */
    create(): void;
    /** @returns The conversationId */
    getConversationId(): string;
    /**
     * Stops this Conversation object polling activities from the bot
     *
     * @fires Conversation#stopped
     */
    stopInterval(): void;
    /**
     * Starts this Conversation object polling activities from the bot
     *
     * Calls stopInterval() internally first
     *
     * @fires Conversation#started
     */
    startInterval(): void;
    /**
     * Sends a message to the conversation
     *
     * @param message The message to send to the bot as part of the conversation
     */
    sendMessage(message: string): void;
    /**
     * Fires the given function when the conversation is connected
     *
     * If we're already connected, the function is immediatly called.
     * Otherwise it'll wait for the connected event, wait {delayForFirstMessage} milliseconds and then call the function
     *
     * @param func The function to be called
     * @param delayForFirstMessage How many milliseconds to wait after being connected
     */
    whenConnected(func: () => void, delayForFirstMessage?: number): void;
    /**
     * Internal function that polls for activities
     * Called by the interval started with startInterval
     */
    protected update(): void;
}
