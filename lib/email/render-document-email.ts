import { render } from "@react-email/render";
import { createElement } from "react";
import { DocumentSentEmail } from "@/lib/email/templates/document-sent";
import type { DocumentSentEmailProps } from "@/lib/email/templates/document-sent";

export type { DocumentSentEmailProps };

export async function renderDocumentEmailHtml(
  props: DocumentSentEmailProps
): Promise<string> {
  const element = createElement(DocumentSentEmail, props);
  return render(element);
}
