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
    <div data-ui="member-identity" className="flex items-center min-w-50 gap-3">
      <span className="grid place-items-center flex-[0_0_34px] h-8.5 rounded-full bg-accent-subtle text-accent text-[12px]" aria-hidden="true">
        {initials}
      </span>
      <div className="min-w-0 wrap-anywhere">
        <span>
          {name}
          {self && <span className="text-muted text-[12px]"> (you)</span>}
        </span>
        {member.profile?.email && member.profile.email !== name && (
          <span className="block mt-1 text-[11px] text-muted">{member.profile.email}</span>
        )}
        {!member.profile && (
          <span className="font-mono block mt-1 text-[11px] text-muted in-data-[ui~='data-table']:text-[11px] in-data-[ui~='data-table']:wrap-anywhere [[data-ui~='dashboard-main']_[data-ui~='data-table']_&]:text-[12px]">{member.user_id}</span>
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
