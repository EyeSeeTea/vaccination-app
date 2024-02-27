/* global $, _, dhis2 */

var getRealDimensions = function($el_, parent) {
    var $el = $($el_.get(0));

    if ($el.length === 0) {
        return { width: 0, height: 0 };
    } else {
        var $clone = $el
            .clone()
            .show()
            .css("visibility", "hidden")
            .appendTo(parent);
        var dimensions = {
            width: $clone.outerWidth(),
            height: $clone.outerHeight(),
        };
        $clone.remove();
        return dimensions;
    }
};

var processWideTables = function() {
    $("#contentDiv").show();
    const contentWidth = $(".ui-tabs-panel").width();
    console.log("Content box width:", contentWidth);

    $(".tableGroupWrapper")
        .get()
        .forEach(tableGroupWrapper => {
            const tableGroups = $(tableGroupWrapper)
                .find(".tableGroup")
                .get();

            if (tableGroups.length <= 1) return;

            /* Show contents temporally so we can get actual rendered width of tables */

            const groups = _.chain(tableGroups)
                .map(tableGroup => ({
                    element: tableGroup,
                    width: getRealDimensions($(tableGroup).find("table"), $("#contentDiv")).width,
                }))
                .sortBy(group => group.width)
                .reverse()
                .value();

            console.log(
                "Tables width: " +
                    groups.map((group, idx) => "idx=" + idx + " width=" + group.width).join(" - ")
            );

            const groupToShow = groups.find(group => group.width <= contentWidth) || groups[0];

            tableGroups.forEach(tableGroup => {
                if (tableGroup !== groupToShow.element) {
                    $(tableGroup).remove();
                }
            });
        });
    $("#contentDiv").hide();
};

var highlightDataElementRows = function() {
    var setClass = function(ev, className, isActive) {
        var tr = $(ev.currentTarget);
        var de_class = (tr.attr("class") || "").split(" ").filter(cl => cl.startsWith("de-"))[0];
        if (de_class) {
            var deId = de_class.split("-")[1];
            var el = $(".de-" + deId);
            el.toggleClass(className, isActive);
            if (tr.hasClass("secondary")) {
                var opacity = isActive ? 1 : 0;
                tr.find(".data-element")
                    .clearQueue()
                    .delay(500)
                    .animate({ opacity: opacity }, 100);
            }
        }
    };

    $("tr.derow")
        .mouseover(ev => setClass(ev, "hover", true))
        .mouseout(ev => setClass(ev, "hover", false))
        .focusin(ev => setClass(ev, "focus", true))
        .focusout(ev => setClass(ev, "focus", false));
};

const storageKey = "RVC_CURRENT_LOCALE";

function getUserSettings() {
    if (dhis2.de.isOffline) return;

    return $.getJSON("../api/userSettings.json?key=keyDbLocale", function(data) {
        console.log("User settings loaded:", data);
        const locale = data.keyDbLocale || "";
        localStorage[storageKey] = locale;
    });
}

function getCurrentLocale() {
    return localStorage[storageKey] || "";
}

var translate = function(options) {
    const translations = options.translations;
    const currentLocale = getCurrentLocale();
    if (!currentLocale) return;

    $("*[data-translate='']")
        .get()
        .forEach(el_ => {
            const el = $(el_);
            const text = el.text();
            const translation = translations[text];

            if (translation) {
                const text2 = translation[currentLocale] || translation["en"] || text;
                el.text(text2);
            }
        });
};

var applyChangesToForm = function(options) {
    highlightDataElementRows();
    processWideTables();
    translate(options);
    $("#tabs").tabs();
    // Set full width to data elements columns after table width has been calculated
    $(".header-first-column").addClass("full-width");
};

var runValidations = function(options, ev, dataSetId, dataValue) {
    if (dataValue.de && options.dataElements[dataValue.de] === "RVC_AEFI") {
        // dhis2.de.validate(completeUncomplete, ignoreValidationSuccess, successCallback)
        dhis2.de.validate(false, true);
    }
};

function validateDataInputPeriods(options) {
    const { dataInput, translations } = options;
    const selectedPeriod = dhis2.de.getSelectedPeriod().startDate;
    const currentDate = new Date().toISOString().split("T")[0];

    const periodMessage =
        selectedPeriod >= dataInput.periodStart && selectedPeriod <= dataInput.periodEnd
            ? undefined
            : getTranslation(translations.selectedPeriodNotInCampaignRange, {
                  selectedPeriod: selectedPeriod,
                  periodStart: dataInput.periodStart,
                  periodEnd: dataInput.periodEnd,
              });

    const entryMessage =
        currentDate >= dataInput.openingDate && currentDate <= dataInput.closingDate
            ? undefined
            : getTranslation(translations.currentDateNotInCampaignEntryRange, {
                  currentDate: currentDate,
                  openingDate: dataInput.openingDate,
                  closingDate: dataInput.closingDate,
              });

    const messages = [periodMessage, entryMessage].filter(msg => msg);

    if (messages.length > 0) {
        const contentTabs = Array.from(document.querySelectorAll("#tabs .ui-tabs-panel"));

        contentTabs.forEach(div => {
            div.innerHTML = `<ul>${messages.map(msg => `<li>${msg}</li>`).join("")}</ul>`;
        });
    }
}

function getTranslation(byLocale, namespace) {
    const currentLocale = getCurrentLocale() || "en";
    const template = (byLocale ? byLocale[currentLocale] : null) || "Translation missing";
    return interpolate(template, namespace);
}

function interpolate(template, namespace) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        return String(namespace[key]);
    });
}

/* Initialize a custom form. Options:

    {
        translations: Dictionary<string, Dictionary<Locale, string>>
        dataElements: Dictionary<Id, Code>
        dataInput: {
            periodStart: string,
            periodEnd: string,
            openingDate: string,
            closingDate: string
        }
    }
*/

// eslint-disable-next-line no-unused-vars
function init(options) {
    $(document).on("dhis2.de.event.formLoaded", () => {
        applyChangesToForm(options);
        validateDataInputPeriods(options);
    });

    $(document).on("dhis2.de.event.dataValueSaved", runValidations.bind(null, options));

    getUserSettings();
}

export {};
