import { createFileRoute, Link } from "@tanstack/react-router";
import { InfoPage, InfoSection } from "@/components/nestly/InfoPage";
import { pageHead, SITE_NAME, COMPANY } from "@/lib/site";

export const Route = createFileRoute("/about")({
  head: () =>
    pageHead({
      title: `About ${SITE_NAME}`,
      description:
        "Nestly connects people looking for rooms, flats and houses in Pune directly with owners. No brokers, no brokerage fees.",
      path: "/about",
    }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <InfoPage
      eyebrow="About"
      title="Homes, straight from the owner"
      intro={
        <p>
          {SITE_NAME} is a rental and property marketplace built in {COMPANY.city}. We help
          students, young professionals and families find rooms, flats and houses by talking
          directly to the people who own them, without paying a broker.
        </p>
      }
    >
      <InfoSection title="Why we built it">
        <p>
          Finding a place in a new city usually means brokerage of one month's rent or more,
          listings that disappear the moment you call, and photos that don't match reality. We think
          the owner and the person moving in should be able to find each other without a middleman.
        </p>
      </InfoSection>

      <InfoSection title="How it works">
        <ul>
          <li>
            Owners post their own listings with photos, rent, deposit and location, free of charge.
          </li>
          <li>
            Seekers search by area, budget and commute time, then message owners or book a visit in
            the app.
          </li>
          <li>
            {SITE_NAME} never charges brokerage. We are a platform that connects you; the rental
            agreement is between you and the owner.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="Staying safe">
        <ul>
          <li>Always visit a property before paying any token amount or deposit.</li>
          <li>
            Never share OTPs, bank passwords or UPI PINs with anyone, including someone claiming to
            be from us.
          </li>
          <li>Get a written, registered rental agreement and keep receipts for every payment.</li>
          <li>
            If a listing looks wrong or someone asks for money up front,{" "}
            <Link to="/contact">tell us</Link> and we'll look into it.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="Get in touch">
        <p>
          Questions, feedback or partnership ideas? Visit our{" "}
          <Link to="/contact">contact page</Link>. Read our <Link to="/terms">terms</Link> and{" "}
          <Link to="/privacy">privacy policy</Link> to understand how the platform works and how we
          handle your data.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
