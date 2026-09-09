# Vendor security questionnaire, completed

Alderwick Systems Ltd. Supplier assurance response.
Form ref AS-VSQ-2026-014. Completed 2 April 2026.

--- Page 1 of 6 ---

SUPPLIER SECURITY QUESTIONNAIRE
Version 4.2

Field: Supplier legal name
Alderwick Systems Ltd.

Field: Product or service assessed
Portside

Field: Respondent name
Kenji Mori

Field: Respondent role
Infrastructure engineer

Field: Date completed
02/04/2026

Field: Approved by
Marcus Ilic, head of engineering

Field: Review cycle
Annual, or on material change

Complete all sections. Where a question does not apply, mark N.A. and
state why in the notes column. Do not leave any item blank.

Alderwick Systems Ltd. Supplier assurance response.
Form ref AS-VSQ-2026-014. Completed 2 April 2026.

--- Page 2 of 6 ---

SECTION 1. GOVERNANCE

1.1 Do you maintain a documented information security policy?
[X] Yes [ ] No [ ] N.A.
Notes: Reviewed annually. Last review January 2026.

1.2 Is there a named individual accountable for information security?
[X] Yes [ ] No [ ] N.A.
Notes: Head of engineering.

1.3 Do all staff complete security awareness training on joining?
[X] Yes [ ] No [ ] N.A.
Notes: On joining and annually thereafter.

1.4 Do you hold ISO 27001 certification?
[ ] Yes [X] No [ ] N.A.
Notes: Not certified. We operate to an internal control set
mapped against it. Certification has been discussed and is not
currently funded.

1.5 Do you undergo an annual independent penetration test?
[X] Yes [ ] No [ ] N.A.
Notes: Last test November 2025. Summary letter available on
request under NDA. Full report is not released.

1.6 Do you carry cyber liability insurance?
[X] Yes [ ] No [ ] N.A.

Alderwick Systems Ltd. Supplier assurance response.
Form ref AS-VSQ-2026-014. Completed 2 April 2026.

--- Page 3 of 6 ---

SECTION 2. DATA PROTECTION

2.1 Is customer data encrypted at rest?
[X] Yes [ ] No [ ] N.A.
Notes: AES-256. Database volumes, object storage and
backups. Keys held in the cloud provider's managed key
service, rotated annually.

2.2 Is customer data encrypted in transit?
[X] Yes [ ] No [ ] N.A.
Notes: TLS 1.2 minimum, TLS 1.3 preferred. Enforced. HTTP
redirects to HTTPS and HSTS is set.

2.3 Are backups encrypted?
[X] Yes [ ] No [ ] N.A.

2.4 State your backup frequency and retention period.
[Free text]
Continuous write ahead log archiving with a daily full snapshot.
Thirty five day retention. Restore is tested quarterly against a
scratch environment and the test is signed off by the engineer who
ran it.

2.5 Do you have a documented data retention and deletion schedule?
[X] Yes [ ] No [ ] N.A.
Notes: Customer data is deleted within 30 days of contract
termination on request, and within 90 days by default.

2.6 Can a customer export their data on request?
[X] Yes [ ] No [ ] N.A.
Notes: Self service export of threads, messages and attachments.

2.7 Do you use customer data for model training?
[ ] Yes [X] No [ ] N.A.

Alderwick Systems Ltd. Supplier assurance response.
Form ref AS-VSQ-2026-014. Completed 2 April 2026.

--- Page 4 of 6 ---

SECTION 3. ACCESS CONTROL

3.1 Is multi factor authentication enforced for all staff accounts?
[X] Yes [ ] No [ ] N.A.
Notes: Hardware key or authenticator app. SMS is not permitted.

3.2 Is access granted on a least privilege basis?
[X] Yes [ ] No [ ] N.A.

3.3 How frequently are access reviews performed?
[Free text]
Quarterly. Every role with production access is listed and
re-approved by the head of engineering. Anyone who has not used a
grant in the review period loses it and asks again if they need it.
The last review was 12 March 2026 and removed four grants, three of
which belonged to people who had changed teams.

3.4 Is production access logged?
[X] Yes [ ] No [ ] N.A.
Notes: Session logging on the bastion. Logs are write once and
retained twelve months.

3.5 Are staff accounts revoked within one working day of departure?
[X] Yes [ ] No [ ] N.A.
Notes: Same day. Offboarding checklist is owned by operations.

3.6 Do you permit shared or generic accounts?
[ ] Yes [X] No [ ] N.A.

3.7 Do support staff have access to customer content?
[X] Yes [ ] No [ ] N.A.
Notes: Yes, and it is audited. A support agent viewing a customer
thread generates an audit record naming the agent, the account and
the reason code. Customers on request can receive a report of every
such access on their account.

Alderwick Systems Ltd. Supplier assurance response.
Form ref AS-VSQ-2026-014. Completed 2 April 2026.

--- Page 5 of 6 ---

SECTION 4. SUBPROCESSORS AND SUPPLY CHAIN

4.1 Do you maintain a published list of subprocessors?
[X] Yes [ ] No [ ] N.A.
Notes: Published on the website. Customers may subscribe to
change notifications.

4.2 How much notice is given before a new subprocessor is engaged?
[Free text]
Thirty days written notice before a new subprocessor begins
processing customer data. Customers may object in writing during
that period.

4.3 Are subprocessors assessed before engagement?
[X] Yes [ ] No [ ] N.A.
Notes: Security review and contract review. Both signed off before
any data flows.

4.4 List subprocessor categories.
[Free text]
Cloud hosting and managed database. Object storage. Transactional
email delivery. Error monitoring. Payment processing. Customer
support desk software. Video conferencing for support calls where
the customer requests one.

4.5 Do any subprocessors have access to plaintext customer content?
[X] Yes [ ] No [ ] N.A.
Notes: The cloud hosting and object storage providers, in the sense
that they operate the storage. No subprocessor is given a working
login to the product.

4.6 Do you resell or share customer data with third parties for
marketing purposes?
[ ] Yes [X] No [ ] N.A.

Alderwick Systems Ltd. Supplier assurance response.
Form ref AS-VSQ-2026-014. Completed 2 April 2026.

--- Page 6 of 6 ---

SECTION 5. INCIDENT MANAGEMENT

5.1 Do you have a documented incident response plan?
[X] Yes [ ] No [ ] N.A.
Notes: Reviewed annually. Tabletop exercise run in October 2025.

5.2 State your incident notification window for a confirmed breach
affecting customer data.
[Free text]
Within 24 hours of confirmation, to the named contact on the
account, by email and by telephone. A written summary follows within
five working days and a full account within thirty days. Where the
incident is still open at 24 hours we notify anyway and say what we
do not yet know.

5.3 Do you notify customers of incidents that do not involve data
loss, for example extended unavailability?
[X] Yes [ ] No [ ] N.A.
Notes: Status page, plus email to account contacts for anything
over one hour.

5.4 Is there a 24 hour contact route for security issues?
[X] Yes [ ] No [ ] N.A.
Notes: security@alderwick.example, monitored by an on call rota.

5.5 Do you operate a vulnerability disclosure process?
[X] Yes [ ] No [ ] N.A.
Notes: Published policy. No paid bounty.

5.6 Have you experienced a reportable data breach in the last
36 months?
[ ] Yes [X] No [ ] N.A.

SECTION 6. RESPONDENT DECLARATION

Field: Signature
K. Mori

Field: Countersignature
M. Ilic

Field: Date
02/04/2026

Field: Attachments provided
Subprocessor list. Penetration test summary letter. Certificate of
insurance.

Alderwick Systems Ltd. Supplier assurance response.
Form ref AS-VSQ-2026-014. Completed 2 April 2026.
