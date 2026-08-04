export type LinkProtocol = "https" | "http" | "ws" | "wss";

export interface LinkDraft {
  address: string;
  groupId: string | null;
  notes: string;
  protocol: LinkProtocol;
  title: string;
}

export interface LinkItem extends LinkDraft {
  id: string;
}

/** 匹配 URL 自带的 scheme 前缀（大小写不敏感，如 https://、ws://） */
const protocolPattern = /^[a-z][a-z0-9+.-]*:\/\//i;

export function getLinkUrl(link: Pick<LinkDraft, "address" | "protocol">) {
  const address = link.address.trim();
  return protocolPattern.test(address) ? address : `${link.protocol}://${address}`;
}
