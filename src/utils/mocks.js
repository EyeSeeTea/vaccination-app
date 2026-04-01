import _ from "lodash";
import sinon from "sinon";

const mocks = {
    api: {
        get: sinon.stub(),
        update: sinon.stub(),
        post: sinon.stub(),
        delete: sinon.stub(),
    },
};
function deepMerge(object, source) {
    return _.mergeWith(object, source, function (objValue, srcValue) {
        if (_.isObject(objValue) && !_.isFunction(objValue) && srcValue) {
            return deepMerge(objValue, srcValue);
        } else if (_.isFunction(objValue) && _.isFunction(srcValue)) {
            return srcValue;
        }
    });
}

export function getD2Stub(partialD2 = {}) {
    return deepMerge(
        {
            Api: {
                getApi: () => mocks.api,
            },
            system: {
                systemInfo: {},
            },
            currentUser: {
                id: "M5zQapPyTZI",
                displayName: "John Traore",
            },
            mocks,
            models: {},
        },
        partialD2
    );
}
