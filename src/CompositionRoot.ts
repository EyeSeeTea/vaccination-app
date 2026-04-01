import { CampaignD2Query } from "./data/CampaignD2Query";
import { CampaignD2Repository } from "./data/CampaignD2Repository";
import { NotificationD2Repository } from "./data/NotificationD2Repository";
import { DeleteCampaignUseCase } from "./domain/usecases/DeleteCampaignUseCase";
import { GetCampaignUseCase } from "./domain/usecases/GetCampaignUseCase";
import { HasCampaignDataUseCase } from "./domain/usecases/HasCampaignDataUseCase";
import { ListCampaignsUseCase } from "./domain/usecases/ListCampaignsUseCase";
import { SaveCampaignUseCase } from "./domain/usecases/SaveCampaignUseCase";
import { MetadataConfig } from "./models/config";
import { D2LegacyGetCampaign } from "./models/D2LegacyGetCampaign";
import DbD2 from "./models/db-d2";
import { D2Api } from "./types/d2-api";

export function getCompositionRoot(options: { db: DbD2; api: D2Api; config: MetadataConfig }) {
    const { db, api, config } = options;

    const repositories = {
        campaignRepository: new CampaignD2Repository(config, db),
        campaignRepositoryOld: new D2LegacyGetCampaign(config, db),
        notificationRepository: new NotificationD2Repository(api),
    };

    const queries = {
        campaignQuery: new CampaignD2Query(config, db),
    };

    return {
        campaigns: {
            list: new ListCampaignsUseCase(queries),
            get: new GetCampaignUseCase(repositories),
            save: new SaveCampaignUseCase(db, repositories),
            delete: new DeleteCampaignUseCase(db, repositories),
            hasData: new HasCampaignDataUseCase(repositories),
        },
    };
}

export type CompositionRoot = ReturnType<typeof getCompositionRoot>;
