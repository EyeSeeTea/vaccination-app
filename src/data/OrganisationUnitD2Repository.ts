import { OrganisationUnit } from "../domain/entities/OrganisationUnit";
import { OrganisationUnitRepository } from "../domain/repositories/OrganisationUnitRepository";
import { D2Api } from "../types/d2-api";

export class OrganisationUnitD2Repository implements OrganisationUnitRepository {
    constructor(private api: D2Api) {}

    public async getByIds(ids: string[]): Promise<OrganisationUnit[]> {
        const res = await this.api.metadata
            .get({
                organisationUnits: {
                    fields: {
                        id: true,
                        displayName: true,
                        path: true,
                        level: true,
                        ancestors: {
                            id: true,
                            displayName: true,
                            path: true,
                            level: true,
                        },
                    },
                    filter: { id: { in: ids } },
                },
            })
            .getData();

        return res.organisationUnits.map(orgUnitAttrs => OrganisationUnit.create(orgUnitAttrs));
    }
}
