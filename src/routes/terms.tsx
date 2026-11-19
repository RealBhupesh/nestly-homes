import { createFileRoute, Link } from "@tanstack/react-router";
import { InfoPage, InfoSection } from "@/components/nestly/InfoPage";
import {
  pageHead,
  SITE_NAME,
  SITE_URL,
  COMPANY,
  SUPPORT_EMAIL,
  GRIEVANCE_OFFICER,
  LEGAL_LAST_UPDATED,
  mailto,
} from "@/lib/site";

// NOTE FOR THE OWNER: this is a good-faith TEMPLATE written for an Indian
// online rental marketplace. It is not legal advice. Have it reviewed by a
// lawyer licensed in India before launch, and fill in the placeholders in
// src/lib/site.ts (legal entity name, address, Grievance Officer).

export const Route = createFileRoute("/terms")({
  head: () =>
    pageHead({
      title: "Terms of use",
      description:
        "The rules for using Nestly: we're an intermediary platform, owners are responsible for their listings, and we never charge brokerage.",
      path: "/terms",
    }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Terms of use"
      updated={LEGAL_LAST_UPDATED}
      intro={
        <p>
          These terms are an agreement between you and {COMPANY.legalName} ("{SITE_NAME}", "we",
          "us") and apply when you use {SITE_URL.replace(/^https?:\/\//, "")} and our related
          services. By creating an account or using {SITE_NAME}, you agree to them. If you don't
          agree, please don't use the service.
        </p>
      }
    >
      <InfoSection title="1. What Nestly is (and isn't)">
        <p>
          {SITE_NAME} is an online platform that lets property owners publish listings and lets
          people looking for a home discover those listings and contact owners. We are an{" "}
          <strong>intermediary</strong> as defined in the Information Technology Act, 2000. We do
          not own, manage, inspect, rent out or sell any property listed on {SITE_NAME}, and we are
          not a party to any agreement between an owner and a tenant or buyer.
        </p>
        <p>
          We are not a real-estate agent or broker. <strong>We do not charge brokerage</strong> to
          owners or seekers, and no one is authorised to collect brokerage on our behalf.
        </p>
      </InfoSection>

      <InfoSection title="2. Your account">
        <ul>
          <li>
            You must be at least 18 years old and able to enter into a binding contract under Indian
            law.
          </li>
          <li>Give accurate information and keep it up to date. One person, one account.</li>
          <li>
            Keep your login credentials safe. You are responsible for activity on your account.
          </li>
          <li>
            A "verified" badge only means we have checked the specific detail described next to it
            (for example, a phone number). It is not a guarantee about the person or the property.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="3. Listings are the owner's responsibility">
        <p>If you post a listing, you confirm that:</p>
        <ul>
          <li>You own the property or are legally authorised by the owner to rent or sell it.</li>
          <li>
            Everything in the listing (rent, deposit, photos, address, amenities, availability) is
            true, current and not misleading, and the photos are of the actual property and yours to
            use.
          </li>
          <li>
            You will comply with applicable laws, including rent-control and tenancy laws,
            registration and stamp duty requirements, and police-verification rules for tenants.
          </li>
          <li>
            You will not discriminate against seekers on the basis of religion, caste, gender, or
            similar grounds.
          </li>
          <li>
            You will mark a listing as rented/sold or archive it promptly once it is no longer
            available.
          </li>
        </ul>
        <p>
          We may review, edit for formatting, hide or remove listings, but we do not verify every
          listing and are not responsible for its accuracy. Seekers should always visit the property
          and verify ownership and documents before paying any money.
        </p>
      </InfoSection>

      <InfoSection title="4. Prohibited content and conduct">
        <p>You must not use {SITE_NAME} to post, send or do anything that:</p>
        <ul>
          <li>
            is fake, fraudulent, misleading, or a listing for a property you have no right to offer;
          </li>
          <li>
            asks for a token amount, deposit or any payment before the seeker has visited the
            property;
          </li>
          <li>charges or solicits brokerage, or advertises a broker's services;</li>
          <li>
            is obscene, defamatory, harassing, hateful, discriminatory, or otherwise unlawful, or
            violates anyone's privacy or intellectual property;
          </li>
          <li>
            impersonates another person or misrepresents your identity or relationship to a
            property;
          </li>
          <li>
            contains malware, spam, or attempts to scrape, overload or break into the service;
          </li>
          <li>
            is listed in Rule 3(1)(b) of the Information Technology (Intermediary Guidelines and
            Digital Media Ethics Code) Rules, 2021, or threatens the unity, integrity, security or
            sovereignty of India.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="5. Messages, visits and payments">
        <p>
          Messaging and tour booking tools are provided for convenience. Any agreement, payment,
          deposit or dispute is strictly between the owner and the seeker. {SITE_NAME} does not
          handle rent or deposits and is not liable for any loss arising from a transaction between
          users.
        </p>
      </InfoSection>

      <InfoSection title="6. AI-assisted features">
        <p>
          Some features (for example natural-language search and auto-filling a listing from photos)
          use automated and AI tools. Their output may be wrong; owners must review any auto-filled
          details before publishing, and remain responsible for them.
        </p>
      </InfoSection>

      <InfoSection title="7. Content licence">
        <p>
          You keep ownership of what you post. You give {SITE_NAME} a non-exclusive, royalty-free,
          worldwide licence to host, display, resize, and promote your listing content on the
          platform and in marketing of the platform, for as long as it is on {SITE_NAME}.
        </p>
      </InfoSection>

      <InfoSection title="8. Suspension and termination">
        <p>
          We may remove content, limit features, or suspend or terminate accounts that break these
          terms or the law, that we reasonably believe are fraudulent, or when required by a court
          or government order. Where practical we will tell you why. You can stop using {SITE_NAME}{" "}
          and delete your account at any time from your{" "}
          <a href="/dashboard/account">account settings</a>.
        </p>
      </InfoSection>

      <InfoSection title="9. Disclaimers and limitation of liability">
        <p>
          {SITE_NAME} is provided "as is" and "as available". To the extent permitted by law, we
          make no warranty about listings, users, or uninterrupted availability of the service, and
          we are not liable for indirect or consequential losses, or for the acts of owners or
          seekers. Nothing in these terms limits liability that cannot be limited under Indian law.
        </p>
      </InfoSection>

      <InfoSection title="10. Grievances and notices">
        <p>
          Complaints about content or these terms can be sent to our Grievance Officer,{" "}
          {GRIEVANCE_OFFICER.name}, at{" "}
          <a href={mailto(GRIEVANCE_OFFICER.email, "Grievance")}>{GRIEVANCE_OFFICER.email}</a>. We
          acknowledge grievances within {GRIEVANCE_OFFICER.acknowledgeWithinHours} hours and resolve
          them within {GRIEVANCE_OFFICER.resolveWithinDays} days. For general help, write to{" "}
          <a href={mailto(SUPPORT_EMAIL)}>{SUPPORT_EMAIL}</a> or see the{" "}
          <Link to="/contact">contact page</Link>.
        </p>
      </InfoSection>

      <InfoSection title="11. Governing law and jurisdiction">
        <p>
          These terms are governed by the laws of India. Subject to applicable consumer-protection
          law, the courts at Pune, Maharashtra have exclusive jurisdiction over any dispute arising
          from them or your use of {SITE_NAME}.
        </p>
      </InfoSection>

      <InfoSection title="12. Changes">
        <p>
          We may update these terms. If changes are significant we will notify you in the app or by
          email before they take effect. Continuing to use {SITE_NAME} after that means you accept
          the updated terms. Please also read our <Link to="/privacy">privacy policy</Link>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
