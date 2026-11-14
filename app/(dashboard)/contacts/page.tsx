import { getServerContext } from "@/lib/server/context";
import { listContacts } from "@/lib/server/data/contacts";
import { toClient } from "@/lib/server/data/serialize";
import ContactsPage, { type Contact } from "./contacts-client";

export default async function Page() {
  const ctx = await getServerContext();
  const { contacts, total } = await listContacts(ctx.organizationId);
  return (
    <ContactsPage
      initialContacts={toClient<Contact[]>(contacts)}
      initialTotal={total}
      initialHasMore={contacts.length < total}
    />
  );
}
