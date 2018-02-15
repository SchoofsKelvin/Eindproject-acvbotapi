
import { default as Conversation } from './conversation';

const conversation = new Conversation();

conversation.on('connected', (...args) => console.log('CONNECTED', ...args));
conversation.on('started', (...args) => console.log('STARTED', ...args));
conversation.on('stopped', (...args) => console.log('STOPPED', ...args));
conversation.on('message', (...args) => console.log('MESSAGE', args[0]));

conversation.create();

setTimeout(() => conversation.sendMessage('Hallo?'), 5000);
setTimeout(() => conversation.sendMessage('Verlof'), 10000);
setTimeout(() => conversation.sendMessage('Ik wil verlof'), 15000);
