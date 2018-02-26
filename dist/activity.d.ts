/**
 * Simple object containing id and name
 */
export interface INameAndId {
    id: string;
    name: string;
}
/**
 * A CardAction used in cards
 */
export interface ICardAction {
    image?: string;
    text?: string;
    title?: string;
    type: 'openUrl' | 'imBack' | 'postBack' | 'call' | 'playAudio' | 'playVideo' | 'showImage' | 'downloadFile' | 'signin';
    value?: any;
}
/**
 * An image used in cards
 */
export interface ICardImage {
    alt?: string;
    tap?: ICardAction;
    url: string;
}
/**
 * Content field of CardThumbnail/CardHero
 */
export interface ICardHeroOrThumbnailContent {
    buttons?: ICardAction[];
    images?: ICardImage[];
    subtitle?: string;
    tap?: ICardAction;
    text?: string;
    title?: string;
}
/**
 * Built-in CardHero
 */
export interface ICardHero {
    contentType: 'application/vnd.microsoft.card.hero';
    contentUrl?: string;
    content: ICardHeroOrThumbnailContent;
    name?: string;
    thumbnailUrl?: string;
}
/**
 * Built-in CardThumbnail
 */
export interface ICardThumbnail {
    contentType: 'application/vnd.microsoft.card.thumbnail';
    contentUrl?: string;
    content: ICardHeroOrThumbnailContent;
    name?: string;
    thumbnailUrl?: string;
}
/**
 * Represents an Attachment in an Activity
 */
export declare type IAttachment = ICardHero | ICardThumbnail;
/**
 * Represents an Activity that can be sent/received
 */
export interface IActivity {
    type: string;
    id: string;
    timestamp: string;
    serviceUrl: string;
    channelId: string;
    from: INameAndId;
    conversation: INameAndId;
    recipient: INameAndId;
    text: string;
    replyToId: string;
    attachments: IAttachment[];
    channelData: {
        [key: string]: any;
    };
}
