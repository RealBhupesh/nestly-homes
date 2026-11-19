import { createFileRoute, Link } from "@tanstack/react-router";
import { InfoPage, InfoSection } from "@/components/nestly/InfoPage";
import {
  pageHead,
  SITE_NAME,
  COMPANY,
  PRIVACY_EMAIL,
  GRIEVANCE_OFFICER,
  LEGAL_LAST_UPDATED,
  mailto,
} from "@/lib/site";

// NOTE FOR THE OWNER: this is a good-faith TEMPLATE aligned with the Digital
// Personal Data Protection Act, 2023 and the IT Rules, 2021. It is not legal
// advice. Have it reviewed by a lawyer licensed in India before launch, keep
// the processor list and retention periods in sync with what the app really
// does, and fill in the placeholders in src/lib/site.ts.

export const Route = createFileRoute("/privacy")({
  head: () =>
    pageHead({
      title: "Privacy policy",
      description:
        "How Nestly collects, uses, shares and protects your personal data under India's Digital Personal Data Protection Act, 2023, and how to exercise your rights.",
      path: "/privacy",
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Privacy policy"
      updated={LEGAL_LAST_UPDATED}
      intro={
        <p>
          This policy explains how {COMPANY.legalName} ("{SITE_NAME}", "we") handles your personal
          data when you use {SITE_NAME}. We act as a <em>Data Fiduciary</em> under the Digital
          Personal Data Protection Act, 2023 ("DPDP Act"). We collect only what we need to run the
          marketplace, and we never sell your personal data.
        </p>
      }
    >
      <InfoSection title="1. Data we collect">
        <ul>
          <li>
            <strong>Account data:</strong> name, email address, phone number, password (stored
            hashed by our authentication provider), profile photo, and sign-in method (e.g. Google).
          </li>
          <li>
            <strong>Listing data (owners):</strong> property address and map location, rent/price,
            deposit, photos, description, amenities, availability and contact preferences.
          </li>
          <li>
            <strong>Messages and visits:</strong> messages you exchange with other users, tour/visit
            requests, reviews you write, saved searches and favourites.
          </li>
          <li>
            <strong>Verification data:</strong> phone verification status and, if you choose to
            verify as an owner, the documents you upload (such as proof of ownership or ID). These
            are stored privately and seen only by our review team.
          </li>
          <li>
            <strong>Usage and device data:</strong> pages viewed, searches, listing views,
            approximate location derived from your searches, browser and device type, IP address and
            error logs.
          </li>
        </ul>
        <p>
          We strip location metadata (EXIF/GPS) from photos in your browser before they're uploaded.
        </p>
      </InfoSection>

      <InfoSection title="2. Why we use it">
        <ul>
          <li>To create and secure your account and let you sign in.</li>
          <li>To publish listings and show them to people searching, including on a map.</li>
          <li>To deliver messages and visit requests, and send you related notifications.</li>
          <li>To verify owners and keep the platform free of fraud, spam and abuse.</li>
          <li>To provide search, commute estimates and AI-assisted features you choose to use.</li>
          <li>To fix bugs, measure performance and improve the service.</li>
          <li>To comply with law, court orders and lawful requests from government agencies.</li>
        </ul>
        <p>
          We process your data on the basis of the consent you give when you sign up and use these
          features, and for the legitimate uses permitted by Section 7 of the DPDP Act (such as
          complying with law). You can withdraw consent at any time (see section 6); this won't
          affect processing already done.
        </p>
      </InfoSection>

      <InfoSection title="3. Who can see your data">
        <ul>
          <li>
            <strong>Other users:</strong> published listings (including the approximate location)
            are public. Your name and the messages you send are visible to the person you're talking
            to. Phone numbers are shown only as described in the listing's contact settings.
          </li>
          <li>
            <strong>Service providers (Data Processors)</strong> who process data for us under
            contract:
            <ul>
              <li>Supabase (database, authentication and file storage)</li>
              <li>Vercel (website hosting and server logs)</li>
              <li>
                Email and SMS/WhatsApp delivery providers (for notifications and one-time passwords)
              </li>
              <li>
                An AI model provider (for natural-language search and listing auto-fill; only the
                text or photos you submit to that feature are sent)
              </li>
              <li>
                Error-monitoring tools (for crash reports, configured not to collect IP addresses)
              </li>
              <li>
                Map tile and geocoding services (OpenFreeMap / OpenStreetMap), queried through our
                servers where possible
              </li>
            </ul>
          </li>
          <li>
            <strong>Authorities:</strong> when required by law, a court order, or a lawful request
            from a government agency.
          </li>
        </ul>
        <p>
          Some providers may store data outside India. Where they do, we rely on transfers permitted
          under the DPDP Act and use providers with appropriate security commitments.
        </p>
      </InfoSection>

      <InfoSection title="4. How long we keep it">
        <ul>
          <li>Account and profile data: while your account is active.</li>
          <li>
            Listings, messages and reviews: while your account is active, or until you delete them.
          </li>
          <li>
            Verification documents: until the review is complete, then deleted or retained only as
            long as law requires.
          </li>
          <li>
            Logs and security records: up to 180 days, in line with the CERT-In Directions, 2022.
          </li>
        </ul>
        <p>
          When you delete your account we erase or anonymise your personal data within 30 days,
          except where we must keep it longer to comply with law or resolve a dispute.
        </p>
      </InfoSection>

      <InfoSection title="5. Cookies and local storage">
        <p>
          We use essential cookies and your browser's local storage to keep you signed in, remember
          your preferences (such as your compare list and recent searches) and keep the site secure.
          We do not use third-party advertising cookies. You can clear these from your browser
          settings, but you may be signed out and some features may not work.
        </p>
      </InfoSection>

      <InfoSection title="6. Your rights">
        <p>Under the DPDP Act you have the right to:</p>
        <ul>
          <li>access a summary of your personal data and how it is processed;</li>
          <li>correct, complete or update your data;</li>
          <li>erase your data and withdraw consent;</li>
          <li>nominate another person to exercise your rights in case of death or incapacity;</li>
          <li>have your grievances addressed.</li>
        </ul>
        <p>
          You can <strong>download a copy of your data</strong> or{" "}
          <strong>delete your account</strong> yourself from{" "}
          <a href="/dashboard/account">your account settings</a>. For anything else, email{" "}
          <a href={mailto(PRIVACY_EMAIL, "Personal data request")}>{PRIVACY_EMAIL}</a>. We may need
          to verify your identity before acting on a request.
        </p>
      </InfoSection>

      <InfoSection title="7. Security">
        <p>
          We use encryption in transit (HTTPS), access controls and row-level security in our
          database, and limit staff access to personal data. No system is perfectly secure; if a
          personal data breach affects you, we will notify you and the Data Protection Board of
          India as the DPDP Act requires.
        </p>
      </InfoSection>

      <InfoSection title="8. Children">
        <p>
          {SITE_NAME} is meant for adults. We do not knowingly collect personal data of anyone under
          18. If you believe a child has given us data, contact us and we will delete it.
        </p>
      </InfoSection>

      <InfoSection title="9. Grievance Officer">
        <p>
          In accordance with the IT Rules, 2021 and the DPDP Act, our Grievance Officer is:
          <br />
          {GRIEVANCE_OFFICER.name}
          <br />
          <a href={mailto(GRIEVANCE_OFFICER.email, "Privacy grievance")}>
            {GRIEVANCE_OFFICER.email}
          </a>
          <br />
          {GRIEVANCE_OFFICER.address}
        </p>
        <p>
          We acknowledge complaints within {GRIEVANCE_OFFICER.acknowledgeWithinHours} hours and aim
          to resolve them within {GRIEVANCE_OFFICER.resolveWithinDays} days. If you're not satisfied
          with our response, you may approach the Data Protection Board of India.
        </p>
      </InfoSection>

      <InfoSection title="10. Changes to this policy">
        <p>
          We'll post any changes on this page and update the date above. For significant changes
          we'll also notify you in the app or by email. See also our{" "}
          <Link to="/terms">terms of use</Link>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
