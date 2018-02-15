
export interface INameAndId {
  id: string;
  name: string;
}

export interface ICardAction {
  image?: string;
  text?: string;
  title?: string;
  type: 'openUrl' | 'imBack' | 'postBack' | 'call' | 'playAudio' | 'playVideo' | 'showImage' | 'downloadFile' | 'signin';
  value?: any;
}

export interface ICardImage {
  alt?: string;
  tap?: ICardAction;
  url: string;
}

export interface ICardHeroOrThumbnailContent {
  buttons?: ICardAction[];
  images?: ICardImage[];
  subtitle?: string;
  tap?: ICardAction;
  text?: string;
  title?: string;
}
export interface ICardHero {
  contentType: 'application/vnd.microsoft.card.hero';
  contentUrl?: string;
  content: ICardHeroOrThumbnailContent;
  name?: string;
  thumbnailUrl?: string;
}
export interface ICardThumbnail {
  contentType: 'application/vnd.microsoft.card.hero';
  contentUrl?: string;
  content: ICardHeroOrThumbnailContent;
  name?: string;
  thumbnailUrl?: string;
}

export type IAttachment = ICardHero | ICardThumbnail;

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
}
