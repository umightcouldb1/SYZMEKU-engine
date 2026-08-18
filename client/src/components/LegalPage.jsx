import React from 'react';
import { Link } from 'react-router-dom';
import './LegalPage.css';

const updatedAt = 'August 18, 2026';

const sections = {
  terms: {
    label: 'Terms of Service',
    title: 'Terms of Service',
    intro: 'These Terms govern access to T.O.I. Souljah Academy, Big SYZ, SYZMEKU, The Freedom Audit, and related digital tools, content, coaching resources, and social publishing features.',
    items: [
      {
        heading: 'Use of the Platform',
        body: 'You may use the platform for lawful personal, educational, coaching, business, and creative execution purposes. You are responsible for the accuracy of information you submit and for keeping your account credentials secure.',
      },
      {
        heading: 'Coaching and Educational Content',
        body: 'The platform provides educational, reflective, strategic, and coaching-oriented content. It is not a substitute for medical, legal, financial, tax, mental health, or emergency professional advice.',
      },
      {
        heading: 'Payments and Digital Products',
        body: 'Paid products, including The Freedom Audit, are delivered digitally. Prices, access rules, and entitlement checks may vary by product. Stripe or another payment processor may handle payment information according to its own terms.',
      },
      {
        heading: 'Social Publishing',
        body: 'Social Command connects only through official provider APIs when you authorize it. You remain responsible for the content you approve, publish, schedule, or submit to third-party platforms and for complying with each platform\'s rules.',
      },
      {
        heading: 'Account Access',
        body: 'We may suspend or limit access if use appears abusive, unlawful, harmful, or inconsistent with these Terms or platform security requirements.',
      },
      {
        heading: 'Intellectual Property',
        body: 'T.O.I. Souljah Academy, Big SYZ, SYZMEKU, The Freedom Audit, names, visual identity, prompts, workflows, and original platform content are owned by or licensed to T.O.I. Souljah Academy. You retain rights to your own content, subject to the permissions needed to operate requested services.',
      },
      {
        heading: 'Third-Party Services',
        body: 'The platform may connect to services such as Stripe, Meta, Google/YouTube, TikTok, Vercel, Render, or other providers. Their services are governed by their own terms and policies.',
      },
      {
        heading: 'Limitation of Liability',
        body: 'To the fullest extent permitted by law, the platform is provided as-is and without guarantees of uninterrupted availability, specific outcomes, or error-free operation.',
      },
      {
        heading: 'Contact',
        body: 'Questions about these Terms can be sent through the public contact channels listed on toisouljahacademy.com or through the account/support channel used to access the service.',
      },
    ],
  },
  privacy: {
    label: 'Privacy Policy',
    title: 'Privacy Policy',
    intro: 'This Privacy Policy explains how T.O.I. Souljah Academy handles information for Big SYZ, SYZMEKU, The Freedom Audit, Social Command, and related services.',
    items: [
      {
        heading: 'Information We Collect',
        body: 'We may collect account details, login/session data, product purchase records, profile preferences, assessment responses, social connection metadata, approved campaign drafts, analytics snapshots, support messages, and technical logs needed to operate the platform.',
      },
      {
        heading: 'Payment Information',
        body: 'Payment card details are processed by Stripe or another payment processor. We store payment status, product entitlement, checkout/session references, and purchase history needed to provide access.',
      },
      {
        heading: 'Social Platform Connections',
        body: 'If you connect Meta, YouTube, TikTok, or another provider, we store only the OAuth tokens, scopes, expiry data, and account metadata required to perform actions you request. Tokens are encrypted on the server and are not exposed in the browser.',
      },
      {
        heading: 'How We Use Information',
        body: 'Information is used to authenticate users, provide purchased products, personalize coaching experiences, generate and save audit results, draft and publish approved social content, refresh provider analytics when authorized, prevent abuse, and improve platform reliability.',
      },
      {
        heading: 'Sharing',
        body: 'We share information with service providers only as needed to operate the platform, such as hosting, database, payment, analytics, email, or officially authorized social API services. We do not sell personal information.',
      },
      {
        heading: 'Your Choices',
        body: 'You can choose not to connect social accounts, disconnect connected accounts, revoke access through the third-party provider, avoid submitting optional profile data, or request account support through public contact channels on toisouljahacademy.com.',
      },
      {
        heading: 'Retention',
        body: 'We keep account, purchase, assessment, campaign, connection, audit, and analytics records for as long as needed to operate the service, resolve disputes, maintain security, comply with legal obligations, and support user-requested access. Disconnected social accounts are marked inactive and are not used for new publishing actions.',
      },
      {
        heading: 'Security',
        body: 'We use access controls, encrypted token storage, server-side entitlement checks, and operational safeguards. No online service can guarantee perfect security, so you should keep account credentials private and report suspicious activity.',
      },
      {
        heading: 'Children',
        body: 'The platform is not intended for children under 13. If you believe a child has submitted personal information, contact us through toisouljahacademy.com.',
      },
      {
        heading: 'Updates',
        body: 'This policy may be updated as the platform changes. The updated date on this page reflects the latest published version.',
      },
    ],
  },
};

export default function LegalPage({ type = 'terms' }) {
  const content = sections[type] || sections.terms;

  return (
    <main className="legal-page" aria-label={content.label}>
      <section className="legal-page__hero">
        <Link className="legal-page__home" to="/welcome">T.O.I. Souljah Academy</Link>
        <p>{content.label}</p>
        <h1>{content.title}</h1>
        <span>Last updated: {updatedAt}</span>
      </section>

      <section className="legal-page__content">
        <p className="legal-page__intro">{content.intro}</p>
        {content.items.map((item) => (
          <article key={item.heading}>
            <h2>{item.heading}</h2>
            <p>{item.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
