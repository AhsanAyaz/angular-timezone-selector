/*global angular, _, moment, $, jstz*/

/**
 * angular-timezone-selector
 *
 * A simple directive that allows a user to pick their timezone
 *
 * Author:  Ashok Fernandez <ashok@mish.guru>
 * Date:    12/06/2015
 * License: MIT
 */

 /**
 * Edited By:  Ahsan Ayaz <ahsan.ubitian@gmail.com>
 * Date:    02/22/2016
 * License: MIT
 */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
  reIsPlainProp = /^\w*$/,
  rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;


var helper = {
  get : function(object, path, defaultValue) {
    var result = object == null ? undefined : helper.baseGet(object, path);
    return result === undefined ? defaultValue : result;
  },
  baseGet: function(object, path) {
    path = helper.isKey(path, object) ? [path + ''] : helper.baseToPath(path);

    var index = 0,
      length = path.length;

    while (object != null && index < length) {
      object = object[path[index++]];
    }
    return (index && index == length) ? object : undefined;
  },
  isKey: function(value, object) {
    if (typeof value == 'number') {
      return true;
    }
    return !isArray(value) &&
      (reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
      (object != null && value in Object(object)));
  },
  baseToPath: function(value) {
    return isArray(value) ? value : helper.stringToPath(value);
  },
  stringToPath: function(string) {
    var result = [];
    toString(string).replace(rePropName, function(match, number, quote, string) {
      result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
    });
    return result;
  },
  where: function(obj, attrs) {
    return _.filter(obj, _.matcher(attrs));
  }
}

angular.module('angular-timezone-selector', [])
  .constant('_', _)
  .constant('moment', moment)
  .factory('timezoneFactory', ['_', 'moment', function (_, moment) {
    return {
      get: function () {
        var timezoneMap = {}
        _.forEach(moment.tz.names(), function (zoneName) {
          var tz = moment.tz(zoneName)
          timezoneMap[zoneName] = {
            id: zoneName,
            name: zoneName.replace(/_/g, ' '),
            offset: 'UTC' + tz.format('Z'),
            nOffset: tz.utcOffset()
          }
        })
        return timezoneMap
      }
    }
  }])

  // Timezone name to country codemap
  .factory('zoneToCC', ['_', function (_) {
    // Note: zones is populated with the data from 'data/zone.csv' when this file is built
    var zones = []
    var zoneMap = {}
    _.forEach(zones, function (zone) {
      zoneMap[zone.name] = zone.cca2
    })
    return zoneMap
  }])

  // Country code to country name map
  .factory('CCToCountryName', ['_', function (_) {
    // Note: codes is populated with the data from 'data/cca2_to_country_name.csv' when this file is built
    var codes = []
    var codeMap = {}
    _.forEach(codes, function (code) {
      codeMap[code.cca2] = code.name
    })
    return codeMap
  }])

  .directive('timezoneSelector', ['_', 'moment', 'timezoneFactory', 'zoneToCC', 'CCToCountryName', function (_, moment, timezoneFactory, zoneToCC, CCToCountryName) {
    return {
      restrict: 'E',
      replace: true,
      template: '<select style="min-width:300px;"></select>',
      scope: {
        ngModel: '=',
        translations: '='
      },
      link: function ($scope, elem, attrs) {
        var data = []
        var timezones = timezoneFactory.get()

        // Group the timezones by their country code
        var timezonesGroupedByCC = {}
        _.forEach(timezones, function (timezone) {
          if (_.has(zoneToCC, timezone.id)) {
            var CC = zoneToCC[timezone.id]
            timezonesGroupedByCC[CC] = !timezonesGroupedByCC[CC] ? [] : timezonesGroupedByCC[CC]
            timezonesGroupedByCC[CC].push(timezone)
          }
        })

        // Add the grouped countries to the data array with their country name as the group option
        _.forEach(timezonesGroupedByCC, function (zonesByCountry, CC) {
          var zonesForCountry = {
            text: CCToCountryName[CC] + ': ',
            children: zonesByCountry,
            firstNOffset: zonesByCountry[0].nOffset
          }

          data.push(zonesForCountry)
        })

        // Sort by UTC or country name
        if (attrs.sortBy === 'offset') {
          data = _.sortBy(data, 'firstNOffset')
          _.forEach(data, function (zonesForCountry, key) {
            zonesForCountry.children = _.sortBy(zonesForCountry.children, 'nOffset')
          })
        } else {
          data = _.sortBy(data, 'text')
        }

        // add initial options forlocal
        if (attrs.showLocal !== undefined) {
          if (jstz !== undefined) {
            // Make sure the tz from jstz has underscores replaced with spaces so it matches
            // the format used in timezoneFactory
            var extraTZs = _.where(timezones, { 'id': jstz.determine().name().replace(/_/g, ' ') })
          } else {
            var localUTC = 'UTC' + moment().format('Z')
            extraTZs = _.where(timezones, {'offset': localUTC})
          }

          data.splice(0, 0, {
            text: helper.get($scope, 'translations.local', 'Local') + ': ',
            children: extraTZs,
            firstNOffset: extraTZs[0].nOffset,
            firstOffset: extraTZs[0].offset
          })
        }

        if (attrs.setLocal !== undefined) {
          if (jstz !== undefined) {
            $scope.ngModel || ($scope.ngModel = jstz.determine().name())
          }
        }

        // add initial options
        if (attrs.primaryChoices !== undefined) {
          var primaryChoices = []
          _.forEach(attrs.primaryChoices.split(' '), function (choice) {
            primaryChoices.push(choice.replace('_', ' '))
          })
          extraTZs = _.filter(timezones, function (tz) { return _.includes(primaryChoices, tz.name) })

          data.splice(0, 0, {
            text: helper.get($scope, 'translations.primary', 'Primary') + ': ',
            children: extraTZs,
            firstNOffset: extraTZs[0].nOffset,
            firstOffset: extraTZs[0].offset
          })
        }

        // Construct a select box with the timezones grouped by country
        _.forEach(data, function (group) {
          var optgroup = $('<optgroup label="' + group.text + '">')
          group.children.forEach(function (option) {
            if (attrs.displayUtc === 'true' && option.name.indexOf('(UTC') === -1) {
              option.name = option.name + ' (' + option.offset + ')'
            }

            optgroup.append('<option value="' + option.id + '">' +
              option.name + '</option>')
          })
          elem.append(optgroup)
        })

        // Initialise the chosen box
        elem.chosen({
          width: attrs.width || '300px',
          include_group_label_in_selected: true,
          search_contains: true,
          no_results_text: helper.get($scope, 'translations.no_results_text',
              'No results, try searching for the name of your country or nearest major city.'),
          placeholder_text_single: helper.get($scope, 'translations.placeholder', 'Choose a timezone')
        })

        // Update the box if ngModel changes
        $scope.$watch('ngModel', function () {
          elem.val($scope.ngModel)
          elem.trigger('chosen:updated')
        })
      }
    }
  }])
