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

export function getLinkUrl(link: Pick<LinkDraft, "address" | "protocol">) {
  return `${link.protocol}://${link.address}`;
}
