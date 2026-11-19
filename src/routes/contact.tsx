import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Mail, ShieldAlert, Clock } from "lucide-react";
import { InfoPage, InfoSection } from "@/components/nestly/InfoPage";
import {
  pageHead,
  SITE_NAME,
  SUPPORT_EMAIL,
  GRIEVANCE_OFFICER,
  COMPANY,
  SUPPORT_RESPONSE_DAYS,
  mailto,
} from "@/lib/site";

export const Route = createFileRoute("/contact")({
  head: () =>
    pageHead({
      title: "Contact & grievance officer",
      description:
        "Contact Nestly support, report a listing, or reach our Grievance Officer under the IT Rules, 2021.",
      path: "/contact",
    }),
  component: ContactPage,
});

function ContactCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-card p-5">
      <div className="flex items-center gap-2 text-ink">
        {icon}
        <h3 className="text-[15px] font-semibold">{title}</h3>
      </div>
      <div className="mt-2 space-y-1 text-[14px] leading-relaxed text-ink/70">{children}</div>
    </div>
  );
}

function ContactPage() {
  return (
    <InfoPage
      eyebrow="Contact"
      title="We're here to help"
      intro={
        <p>
          Whether you're an owner, a seeker, or someone who spotted a problem on {SITE_NAME}, here's
          how to reach us.
        </p>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ContactCard icon={<Mail className="h-4 w-4 text-coral" />} title="Support">
          <p>Account help, listing questions, bugs and feedback.</p>
          <p>
            <a
              className="font-medium text-coral hover:underline"
              href={mailto(SUPPORT_EMAIL, `${SITE_NAME} support`)}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </ContactCard>
        <ContactCard
          icon={<ShieldAlert className="h-4 w-4 text-coral" />}
          title="Grievance Officer"
        >
          <p>{GRIEVANCE_OFFICER.name}</p>
          <p>
            <a
              className="font-medium text-coral hover:underline"
              href={mailto(GRIEVANCE_OFFICER.email, "Grievance")}
            >
              {GRIEVANCE_OFFICER.email}
            </a>
          </p>
          <p>{GRIEVANCE_OFFICER.address}</p>
        </ContactCard>
      </div>

      <InfoSection title="Response times">
        <p className="flex items-start gap-2">
          <Clock className="mt-1 h-4 w-4 shrink-0 text-ink/50" />
          <span>
            We aim to reply to support emails within {SUPPORT_RESPONSE_DAYS} working days.
            Grievances are acknowledged within {GRIEVANCE_OFFICER.acknowledgeWithinHours} hours and
            resolved within {GRIEVANCE_OFFICER.resolveWithinDays} days of receipt, as required by
            the Information Technology (Intermediary Guidelines and Digital Media Ethics Code)
            Rules, 2021.
          </span>
        </p>
      </InfoSection>

      <InfoSection title="Report a listing or user">
        <p>
          If a listing is fake, misleading, already rented, asks for money before a visit, or
          contains offensive content, email{" "}
          <a href={mailto(SUPPORT_EMAIL, "Report a listing")}>{SUPPORT_EMAIL}</a> with the listing
          link and what's wrong. Requests to remove unlawful content or content that impersonates
          you, or that shares your private information, should go to the Grievance Officer; we act
          on these on priority.
        </p>
      </InfoSection>

      <InfoSection title="Your personal data">
        <p>
          You can download or delete your data from your{" "}
          <a href="/dashboard/account">account settings</a>. For any other request about your
          personal data under the Digital Personal Data Protection Act, 2023, write to the Grievance
          Officer. See our <Link to="/privacy">privacy policy</Link> for details.
        </p>
      </InfoSection>

      <InfoSection title="Postal address">
        <p>
          {COMPANY.legalName}
          <br />
          {COMPANY.address}
        </p>
      </InfoSection>
    </InfoPage>
  );
}
