import _ from "lodash";
import DbD2, { ApiResponse } from "./db-d2";
import { generateUid } from "d2/uid";
import { Moment } from "moment";
import {
    OrganisationUnitPathOnly,
    Response,
    MetadataResponse,
    Ref,
    getId,
    NamedRef,
    getRef,
} from "./db.types";
import { MetadataConfig } from "./config";

export interface CategoryOptionTeam {
    id: string;
    name: string;
    shortName: string;
    displayName: string;
    publicAccess: string;
    displayShortName: string;
    startDate: Moment;
    endDate: Moment;
    dimensionItemType: "CATEGORY_OPTION";
    categories: Ref[];
    organisationUnits: Ref[];
    categoryOptionCombos: Ref[];
}

export interface TeamsMetadata {
    elements: CategoryOptionTeam[];
}

export class Teams {
    constructor(private metadata: TeamsMetadata) {}

    static build(metadata: TeamsMetadata) {
        return new Teams(metadata);
    }

    public getTeams(args: {
        teams: number;
        name: string;
        organisationUnits: OrganisationUnitPathOnly[];
        teamsCategoyId: string;
        startDate: Moment;
        endDate: Moment;
        isEdit: boolean;
    }): CategoryOptionTeam[] {
        const { teams, name, organisationUnits, teamsCategoyId, startDate, endDate, isEdit } = args;
        const {
            metadata: { elements: oldTeams },
        } = this;
        if (!teams) return [];

        if (!isEdit) {
            return this.generateTeams(
                teams,
                name,
                organisationUnits,
                teamsCategoyId,
                startDate,
                endDate
            );
        }

        const teamDifference = teams - _.size(oldTeams);

        //Update periodDates and OU references for previous teams
        const orderedOldTeams = _.orderBy(oldTeams, team => {
            const match = team.name.match(/\d+/);
            return match ? parseInt(match[0]) : teams;
        });
        const allTeams = orderedOldTeams.map((ot, i) => ({
            ...ot,
            name: getTeamName(name, i + 1, teams),
            startDate,
            endDate,
            organisationUnits,
        }));

        if (teamDifference > 0) {
            return [
                ...allTeams,
                ...this.generateTeams(
                    teamDifference,
                    name,
                    organisationUnits,
                    teamsCategoyId,
                    startDate,
                    endDate,
                    _.size(oldTeams)
                ),
            ];
        } else if (teamDifference < 0) {
            return _(allTeams).take(teams).value();
        } else {
            return allTeams;
        }
    }

    private generateTeams(
        teams: number,
        campaignName: string,
        organisationUnits: OrganisationUnitPathOnly[],
        categoryIdForTeams: string,
        startDate: Moment,
        endDate: Moment,
        nameOffset = 0
    ): CategoryOptionTeam[] {
        const teamsData: CategoryOptionTeam[] = _.range(1, teams + 1).map(i => {
            const name = getTeamName(campaignName, nameOffset + i, teams);
            const id = generateUid();
            const categoryOption: CategoryOptionTeam = {
                id,
                name,
                shortName: `Team ${nameOffset + i}_${id}`,
                displayName: name,
                publicAccess: "rwrw----",
                displayShortName: name,
                startDate,
                endDate,
                dimensionItemType: "CATEGORY_OPTION",
                categories: [
                    {
                        id: categoryIdForTeams,
                    },
                ],
                organisationUnits: organisationUnits.map(ou => ({
                    id: ou.id,
                })),
                categoryOptionCombos: [],
            };
            return categoryOption;
        });

        return teamsData;
    }

    static async updateTeamCategory(
        db: DbD2,
        newTeams: NamedRef[],
        teamsToDelete: Ref[],
        config: MetadataConfig
    ): Promise<Response<string>> {
        type TeamMetadata = {
            categories: Array<{
                categoryOptions: Array<{ id: string; name: string }>;
            }>;
            categoryCombos: Array<{
                id: string;
                categoryOptionCombos: Array<{
                    id: string;
                    categoryOptions: Ref[];
                }>;
            }>;
        };

        const { categories, categoryCombos } = await db.api.get<TeamMetadata>("/metadata", {
            "categories:fields": ":owner",
            "categories:filter": `code:eq:${config.categoryCodeForTeams}`,
            "categoryCombos:fields": "id,categoryOptionCombos[id,categoryOptions[id]]",
            "categoryCombos:filter": `code:eq:${config.categoryComboCodeForTeams}`,
        });

        const teamCategory = categories[0];
        const teamCategoryCombo = categoryCombos[0];
        if (!teamCategory || !teamCategoryCombo)
            throw new Error("Teams category/categoryCombo not found");

        const previousTeams = teamCategory?.categoryOptions || [];
        const teamsToDeleteIds = _.map(teamsToDelete, getId);
        const filteredPreviousTeams = previousTeams.filter(
            team => !_.includes(teamsToDeleteIds, team.id)
        );

        const previousTeamsIds = _.map(previousTeams, getId);
        const filteredNewTeams = _(newTeams)
            .reject(team => _.includes(previousTeamsIds, team.id))
            .value();

        const allTeams = [...filteredPreviousTeams, ...filteredNewTeams];
        const teamsCategoryUpdated = { ...teamCategory, categoryOptions: allTeams.map(getRef) };

        const existingTeamIdsInCocs = new Set(
            _(teamCategoryCombo?.categoryOptionCombos)
                .flatMap(coc => coc.categoryOptions)
                .map(getId)
                .value()
        );
        const cocsToPost = _(allTeams)
            .reject(team => existingTeamIdsInCocs.has(team.id))
            .map(team => ({
                id: generateUid(),
                categoryCombo: { id: teamCategoryCombo.id },
                name: team.name,
                categoryOptions: [getRef(team)],
            }))
            .value();

        const teamsResponse: ApiResponse<MetadataResponse> = await db.postMetadata({
            categories: [teamsCategoryUpdated],
            categoryOptionCombos: cocsToPost,
        });

        if (!teamsResponse.status) {
            return { status: false, error: "Cannot update teams category" };
        } else {
            return { status: true };
        }
    }

    // Teams must be deleted after all asociated dashboard and dashboard items (favorites) are deleted
    static async deleteTeams(db: DbD2, teams: CategoryOptionTeam[]) {
        const toDelete = teams.map(t => ({ model: "categoryOptions", id: t.id }));
        return await db.deleteMany(toDelete, ["categoryOptions"]);
    }
}

export async function getTeamsForCampaign(
    db: DbD2,
    organisationUnitIds: string[],
    teamCategoryId: string,
    campaignName: string
): Promise<CategoryOptionTeam[]> {
    const { categoryOptions } = await db.api.get("/metadata", {
        "categoryOptions:fields": ":owner,categories[id],name,categoryOptionCombos[id]",
        "categoryOptions:filter": `organisationUnits.id:in:[${organisationUnitIds}]`,
    });

    return filterTeamsByNames(categoryOptions, [campaignName], teamCategoryId);
}

export function filterTeamsByNames(
    teams: CategoryOptionTeam[],
    campaignNames: string[],
    teamCategoryId: string
): CategoryOptionTeam[] {
    if (_.isEmpty(teams)) return [];
    const nameMatches = (teamName: string, campaignName: string) => {
        const splitStr = " - ";
        const campaignNameFromTeam = teamName.split(splitStr).slice(1).join(splitStr);
        const prefixRegexp = new RegExp("^Team \\d+" + splitStr);
        return Boolean(teamName.match(prefixRegexp) && campaignName === campaignNameFromTeam);
    };

    const filteredTeams = teams.filter(
        (co: { categories: Array<{ id: string }>; name: string }) => {
            const categoryIds = co.categories.map(c => c.id);
            return (
                _.includes(categoryIds, teamCategoryId) &&
                _(campaignNames).some(campaignName => nameMatches(co.name, campaignName))
            );
        }
    );

    return filteredTeams;
}

function leftZeroPad(num: number, size: number): string {
    const numString = num.toString();
    const padSize = Math.max(size - numString.length, 0);
    return "0".repeat(padSize) + numString;
}

function getTeamName(campaignName: string, teamNumber: number, _teamsCount: number): string {
    const paddedTeamNumber = leftZeroPad(teamNumber, 3);
    return `Team ${paddedTeamNumber} - ${campaignName}`;
}
