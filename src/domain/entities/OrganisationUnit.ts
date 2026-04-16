import _ from "lodash";
import { Struct } from "../../models/Struct";

type OrganisationUnitAttrs = {
    id: string;
    displayName: string;
    level: number;
    path: string;
    ancestors?: OrgUnitWithoutAncestors[];
};

export class OrganisationUnit extends Struct<OrganisationUnitAttrs>() {
    getFullOrgUnitName(): string {
        return _(this.ancestors || [])
            .concat([this])
            .map(orgUnit => orgUnit.displayName)
            .join(" -> ");
    }
}

type OrgUnitWithoutAncestors = Omit<OrganisationUnitAttrs, "ancestors">;
