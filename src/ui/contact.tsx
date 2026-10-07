import { whatsappUrl } from "../domain/phone.ts";
import { Icon } from "./icons.tsx";
import { text } from "./text.ts";

type Props = { phone: string; title: string; call: boolean; labelled?: true };

export function Contact({ phone, title, call, labelled }: Props) {
  const link = labelled ? "button" : "ib";
  return (
    <span className={labelled ? "contact" : "acts"}>
      {call && (
        <a className={labelled ? `${link} secondary` : link} href={`tel:${phone}`} aria-label={labelled ? undefined : text.callNamed(title)}>
          <Icon name="call" />
          {labelled && `${text.call} ${phone}`}
        </a>
      )}
      <a className={link} href={whatsappUrl(phone)} rel="noopener noreferrer" aria-label={labelled ? undefined : text.whatsappNamed(title)}>
        <Icon name="chat" />
        {labelled && text.whatsapp}
      </a>
    </span>
  );
}
