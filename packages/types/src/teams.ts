/** A person referenced from a team (lead or member). */
export interface TeamMemberDTO {
  userId: string;
  name: string;
  email: string;
  designation?: string;
}

/** A team: an explicit, many-to-many grouping of people with one or more leads.
 *  Team membership augments the RBAC scope (a lead sees/approves their members
 *  on top of the reporting-line/department scope). */
export interface TeamDTO {
  id: string;
  name: string;
  description?: string;
  leads: TeamMemberDTO[];
  members: TeamMemberDTO[];
  memberCount: number;
  /** True when the current actor may edit this team's membership. */
  canManage: boolean;
  createdAt: string;
}
