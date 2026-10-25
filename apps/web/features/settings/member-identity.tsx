import { CopyButton } from "@/components/copy-button";
import type { Membership } from "./types";

export function memberName(member: Membership) {
  return (
    member.profile?.name ||
    member.profile?.email ||
    "Member " + member.user_id.slice(-8)
  );
}

export function MemberIdentity({
  member,
  self = false,
}: {
  member: Membership;
  self?: boolean;
}) {
  const name = memberName(member);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div className="member-identity">
      <span className="member-avatar" aria-hidden="true">
        {initials}
      </span>
      <div className="member-identity-copy">
        <span>
          {name}
          {self && <span className="member-self"> (you)</span>}
        </span>
        {member.profile?.email && member.profile.email !== name && (
          <span className="table-secondary">{member.profile.email}</span>
        )}
        {!member.profile && (
          <span className="table-secondary mono">{member.user_id}</span>
        )}
      </div>
      <CopyButton
        value={member.user_id}
        label="Copy account ID"
        successMessage="Account ID copied."
        iconOnly
      />
    </div>
  );
}
