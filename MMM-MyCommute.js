/*********************************

 Magic Mirror Module:
 MMM-MyCommute
 By Jeff Clarke

 Fork of mrx-work-traffic
 By Dominic Marx
 https://github.com/domsen123/mrx-work-traffic

 MIT Licensed

 *********************************/

Module.register('MMM-MyCommute', {

    defaults: {
        apikey: '',
        origin: '65 Front St W, Toronto, ON M5J 1E6',
        startTime: '00:00',
        endTime: '23:59',
        hideDays: [],
        showSummary: true,
        colorCodeTravelTime: true,
        moderateTimeThreshold: 1.1,
        poorTimeThreshold: 1.3,
        nextTransitVehicleDepartureFormat: "[next at]", //h:mm a
        travelTimeFormat: "m [min]",
        travelTimeFormatTrim: "left",
        pollFrequency: 10 * 60 * 1000, //every ten minutes, in milliseconds
        ttsEnabled: true,
        destinations: [
            {
                destination: '40 Bay St, Toronto, ON M5J 2X2',
                label: 'Air Canada Centre',
                mode: 'walking',
                time: null
            },
        ]
    },

    // Define required scripts.
    getScripts: function() {
        return [this.file('mapStyle.js'), "moment.js", this.file("node_modules/moment-duration-format/lib/moment-duration-format.js")]; //, "require.js"
    },

    // Define required styles.
    getStyles: function() {
        return ["MMM-MyCommute.css", "font-awesome.css"];
    },

    transitModes: [
        'bus',
        'subway',
        'train',
        'tram',
        'rail'
    ],


    avoidOptions: [
        'tolls',
        'highways',
        'ferries',
        'indoor'
    ],


    // Icons to use for each transportation mode
    symbols: {
        'driving': 'car',
        'walking': 'walk',
        'bicycling': 'bike',
        'transit': 'streetcar',
        'tram': 'streetcar',
        'bus': 'bus',
        'subway': 'subway',
        'train': 'train',
        'rail': 'train',
        'metro_rail': 'subway',
        'monorail': 'train',
        'heavy_rail': 'train',
        'commuter_train': 'train',
        'high_speed_train': 'train',
        'intercity_bus': 'bus',
        'trolleybus': 'streetcar',
        'share_taxi': 'taxi',
        'ferry': 'boat',
        'cable_car': 'gondola',
        'gondola_lift': 'gondola',
        'funicular': 'gondola',
        'other': 'streetcar'
    },

    mapCache: [],

    start: function() {

        Log.info('Starting module: ' + this.name);

        this.predictions = [];
        this.loading = true;
        this.inWindow = true;
        this.isHidden = false;

        this.getData();
        this.rescheduleInterval();
    },

    refresh: function() {
        let motionDetected = true;
        MM.getModules().withClass('motion').enumerate(function(module) {
            if (typeof module.isMotionDetected === "function") {
                // motionDetected = module.isMotionDetected();
            }
        });

        if (motionDetected === true) {
            console.log("Refreshing directions");
            this.getData();
            this.updateDom(1000);
        }
    },

    rescheduleInterval: function() {
        const self = this;
        console.log("Rescheduling directions interval");
        if (this.loading !== true) {
            this.refresh();
        }
        if (this.interval != null) {
            clearInterval(this.interval);
        }
        this.interval = setInterval(function() {
            self.refresh();
        }, this.config.pollFrequency);
    },

    /*
      function isInWindow()

      @param start
        STRING display start time in 24 hour format e.g.: 06:00

      @param end
        STRING display end time in 24 hour format e.g.: 10:00

      @param hideDays
        ARRAY of numbers representing days of the week during which
        this tested item shall not be displayed.  Sun = 0, Sat = 6
        e.g.: [3,4] to hide the module on Wed & Thurs

      returns TRUE if current time is within start and end AND
      today is not in the list of days to hide.

    */
    isInWindow: function(start, end, hideDays) {

        var now = moment();
        var startTimeSplit = start.split(":");
        var endTimeSplit = end.split(":");
        var startTime = moment().hour(startTimeSplit[0]).minute(startTimeSplit[1]);
        var endTime = moment().hour(endTimeSplit[0]).minute(endTimeSplit[1]);

        if (now.isBefore(startTime) || now.isAfter(endTime)) {
            return false;
        } else if (hideDays.indexOf(now.day()) != -1) {
            return false;
        }

        return true;
    },

    getData: function() {

        //only poll if in window
        if (this.isInWindow(this.config.startTime, this.config.endTime, this.config.hideDays)) {

            console.log("Getting directions");

            //build URLs
            var destinations = new Array();
            for (var i = 0; i < this.config.destinations.length; i++) {

                var d = this.config.destinations[i];

                var destStartTime = d.startTime || '00:00';
                var destEndTime = d.endTime || '23:59';
                var destHideDays = d.hideDays || [];

                if (this.isInWindow(destStartTime, destEndTime, destHideDays)) {
                    var url = 'https://maps.googleapis.com/maps/api/directions/json' + this.getParams(d);
                    destinations.push({url: url, config: d});
                    console.log(url);
                }

            }
            this.inWindow = true;

            if (destinations.length > 0) {
                // this.sendSocketNotification("GOOGLE_TRAFFIC_GET", {
                //     destinations: destinations,
                //     instanceId: this.identifier
                // });
                this.getPredictions({
                    destinations: destinations,
                    instanceId: this.identifier
                });
            } else {
                this.hide(1000, {lockString: this.identifier});
                this.inWindow = false;
                this.isHidden = true;
            }

        } else {

            this.hide(1000, {lockString: this.identifier});
            this.inWindow = false;
            this.isHidden = true;
        }

    },

    getParams: function(dest) {

        var params = '?';
        params += 'origin=' + encodeURIComponent(this.config.origin);
        params += '&destination=' + encodeURIComponent(dest.destination);
        params += '&key=' + this.config.apikey;

        //travel mode
        var mode = 'driving';
        // if (dest.mode && this.travelModes.hasOwnProperty(dest.mode)) {
        //     mode = dest.mode;
        // }
        // params += '&mode=' + mode;

        //transit mode if travelMode = 'transit'
        if (mode == 'transit' && dest.transitMode) {
            var tModes = dest.transitMode.split("|");
            var sanitizedTransitModes = '';
            for (var i = 0; i < tModes.length; i++) {
                if (this.transitModes.indexOf(tModes[i]) != -1) {
                    sanitizedTransitModes += (sanitizedTransitModes == '' ? tModes[i] : "|" + tModes[i]);
                }
            }
            if (sanitizedTransitModes.length > 0) {
                params += '&transit_mode=' + sanitizedTransitModes;
            }
        }
        if (dest.alternatives == true) {
            params += '&alternatives=true';
        }

        if (dest.waypoints) {
            var waypoints = dest.waypoints.split("|");
            for (var i = 0; i < waypoints.length; i++) {
                waypoints[i] = "via:" + encodeURIComponent(waypoints[i]);
            }
            params += '&waypoints=' + waypoints.join("|");
        }

        //avoid
        if (dest.avoid) {
            var a = dest.avoid.split("|");
            var sanitizedAvoidOptions = '';
            for (var i = 0; i < a.length; i++) {
                if (this.avoidOptions.indexOf(a[i]) != -1) {
                    sanitizedAvoidOptions += (sanitizedAvoidOptions == '' ? a[i] : "|" + a[i]);
                }
            }
            if (sanitizedAvoidOptions.length > 0) {
                params += '&avoid=' + sanitizedAvoidOptions;
            }

        }

        params += '&departure_time=now'; //needed for time based on traffic conditions

        return params;
    },

    prepareRouteParams: function(destination) {

        const travelModes = {
            driving: google.maps.TravelMode.DRIVING,
            walking: google.maps.TravelMode.WALKING,
            bicycling: google.maps.TravelMode.BICYCLING,
            transit: google.maps.TravelMode.TRANSIT,
        };

        let routeParams = {
            origin: this.config.origin,
            destination: destination.config.destination,
            provideRouteAlternatives: true,
            drivingOptions: {
                departureTime: new Date(),
                //trafficModel: 'bestguess',
            }
        };

        //travel mode
        routeParams.travelMode = google.maps.TravelMode.DRIVING;
        if (destination.config.mode && travelModes.hasOwnProperty(destination.config.mode)) {
            routeParams.travelMode = travelModes[destination.config.mode];
        }

        // if (mode == 'transit' && destination.transitMode) {
        //     var tModes = destination.transitMode.split("|");
        //     var sanitizedTransitModes = '';
        //     for (var i = 0; i < tModes.length; i++) {
        //         if (this.transitModes.indexOf(tModes[i]) != -1) {
        //             sanitizedTransitModes += (sanitizedTransitModes == '' ? tModes[i] : "|" + tModes[i]);
        //         }
        //     }
        //     if (sanitizedTransitModes.length > 0) {
        //         params += '&transit_mode=' + sanitizedTransitModes;
        //     }
        // }

        if (destination.alternatives === true) {
            routeParams.alternatives = true;
        }
        return routeParams;
    },

    getPredictions: function(payload) {
        const self = this;

        if (typeof self.directionsService !== 'undefined' && self.directionsService) {
            payload.destinations.forEach(function(dest, index) {
                let routeParams = self.prepareRouteParams(dest);

                self.directionsService.route(routeParams, function(response, status) {
                    Log.info(response);
                    self.preparePrediction(dest, index, response, status);
                    self.loadPredictions();
                    self.isHidden = false;
                });
            });
        } else {
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.src = "https://maps.googleapis.com/maps/api/js?key=" + this.config.apikey;

            script.onload = function() {
                self.directionsService = new google.maps.DirectionsService;
                self.getPredictions(payload);
            };

            this.scriptWrapper = script;
        }
    },

    preparePrediction: function(dest, index, response, status) {

        if (status == google.maps.DirectionsStatus.OK) {

            const prediction = new Object({
                config: dest.config,
                rawResponse: response,
            });

            if (response.error_message) {
                console.log("MMM-MyCommute: " + response.error_message);
                prediction.error = true;
            } else {

                let routeList = [];
                for (let i = 0; i < response.routes.length; i++) {
                    let route = response.routes[i];
                    let routeObj = {
                        summary: route.summary,
                        time: route.legs[0].duration.value,
                        bounds: route.bounds,
                    };

                    if (route.legs[0].duration_in_traffic) {
                        routeObj.timeInTraffic = route.legs[0].duration_in_traffic.value;
                    }
                    if (dest.config.mode && dest.config.mode == 'transit') {
                        let transitInfo = [];
                        let gotFirstTransitLeg = false;
                        for (let j = 0; j < route.legs[0].steps.length; j++) {
                            let s = route.legs[0].steps[j];

                            s.transit_details = s.transit;
                            if (s.transit_details) {
                                let arrivalTime = '';
                                if (!gotFirstTransitLeg && dest.config.showNextVehicleDeparture) {
                                    gotFirstTransitLeg = true;
                                    // arrivalTime = ' <span class="transit-arrival-time">(next at ' + s.transit_details.departure_time.text + ')</span>';
                                    arrivalTime = s.transit_details.departure_time.text;
                                }
                                transitInfo.push({
                                    routeLabel: s.transit_details.line.short_name ? s.transit_details.line.short_name : s.transit_details.line.name,
                                    vehicle: s.transit_details.line.vehicle.type,
                                    arrivalTime: arrivalTime,
                                });
                            }
                            routeObj.transitInfo = transitInfo;
                        }
                    }
                    routeList.push(routeObj);
                }
                prediction.routes = routeList;

            }

            this.predictions[index] = prediction;

        } else {
            console.log('Directions request failed due to ' + status)
        }

    },

    svgIconFactory: function(glyph) {

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttributeNS(null, "class", "transit-mode-icon");
        const use = document.createElementNS('http://www.w3.org/2000/svg', "use");
        use.setAttributeNS("http://www.w3.org/1999/xlink", "href", "modules/MMM-MyCommute/icon_sprite.svg#" + glyph);
        svg.appendChild(use);

        return (svg);
    },

    formatTime: function(time, timeInTraffic) {

        const timeEl = document.createElement("span");
        timeEl.classList.add("travel-time");
        if (timeInTraffic != null) {
            timeEl.innerHTML = moment.duration(Number(timeInTraffic), "seconds").format(this.config.travelTimeFormat, {trim: this.config.travelTimeFormatTrim});

            const variance = timeInTraffic / time;
            if (this.config.colorCodeTravelTime) {
                if (variance > this.config.poorTimeThreshold) {
                    timeEl.classList.add("status-poor");
                } else if (variance > this.config.moderateTimeThreshold) {
                    timeEl.classList.add("status-moderate");
                } else {
                    timeEl.classList.add("status-good");
                }
            }

        } else {
            timeEl.innerHTML = moment.duration(Number(time), "seconds").format(this.config.travelTimeFormat, {trim: this.config.travelTimeFormatTrim});
            timeEl.classList.add("status-good");
        }

        return timeEl;

    },

    getTransitIcon: function(dest, route) {
        let transitIcon;

        if (dest.transitMode) {
            transitIcon = dest.transitMode.split("|")[0];
            if (this.symbols[transitIcon] != null) {
                transitIcon = this.symbols[transitIcon];
            } else {
                transitIcon = this.symbols[route.transitInfo[0].vehicle.toLowerCase()];
            }
        } else {
            transitIcon = this.symbols[route.transitInfo[0].vehicle.toLowerCase()];
        }

        return transitIcon;
    },

    buildTransitSummary: function(transitInfo, summaryContainer) {

        for (let i = 0; i < transitInfo.length; i++) {

            const transitLeg = document.createElement("span");
            transitLeg.classList.add('transit-leg');
            transitLeg.appendChild(this.svgIconFactory(this.symbols[transitInfo[i].vehicle.toLowerCase()]));

            const routeNumber = document.createElement("span");
            routeNumber.innerHTML = transitInfo[i].routeLabel;

            if (transitInfo[i].arrivalTime) {
                routeNumber.innerHTML = routeNumber.innerHTML + " (" + this.config.nextTransitVehicleDepartureFormat.replace('[next at]', transitInfo[i].arrivalTime) + ")";
            }

            transitLeg.appendChild(routeNumber);
            summaryContainer.appendChild(transitLeg);
        }

    },

    getDom: function() {

        if (this.loading) {
            return this.loadingDom();
        }

        let wrapper = document.createElement("div");

        for (let i = 0; i < this.predictions.length; i++) {

            let prediction = this.predictions[i];

            let row = document.createElement("div");
            row.classList.add("row");

            let destination = document.createElement("span");
            destination.className = "destination-label bright";
            destination.innerHTML = prediction.config.label;
            row.appendChild(destination);

            let icon = document.createElement("span");
            icon.className = "transit-mode bright";

            let symbolIcon = 'car';
            if (this.config.destinations[i].color) {
                icon.setAttribute("style", "color:" + prediction.config.color);
            }

            if (prediction.config.mode && this.symbols[prediction.config.mode]) {
                symbolIcon = this.symbols[prediction.config.mode];
            }

            if (prediction.error) {
                this.getDomPredictionError(row);
            } else if (prediction.routes.length === 1 || !this.config.showSummary) {
                symbolIcon = this.getDomSinglePrediction(row, prediction, symbolIcon);
            } else {
                symbolIcon = this.getDomMultiplePredictions(row, prediction, symbolIcon);
            }

            icon.appendChild(this.svgIconFactory(symbolIcon));
            row.appendChild(icon);

            if (prediction.config.hasOwnProperty("map")) {
                row.appendChild(this.renderMap(prediction));
            }

            if (this.config.ttsEnabled === true && prediction.config.hasOwnProperty("tts")) {
                let route = prediction.routes[0];
                if (!route.hasOwnProperty("ttsPlayed")) {
                    const routeTime = route.timeInTraffic != null ? route.timeInTraffic : route.time;
                    const message = prediction.config.tts.replace("{duration}", moment.duration(Number(routeTime), "seconds").format("m"));
                    this.sendNotification('MMM-TTS', message);
                    route.ttsPlayed = true;
                }
            }

            wrapper.appendChild(row);
        }

        return wrapper;
    },

    loadingDom: function() {
        let loading = document.createElement("div");
        loading.innerHTML = this.translate("LOADING");
        loading.className = "dimmed light small";
        if (typeof this.scriptWrapper !== 'undefined' && this.scriptWrapper) {
            loading.appendChild(this.scriptWrapper);
        }
        return loading;
    },

    getDomPredictionError: function(row) {
        //no routes available - display an error instead.
        let errorTxt = document.createElement("span");
        errorTxt.classList.add("route-error");
        errorTxt.innerHTML = "Error";
        row.appendChild(errorTxt);
    },

    getDomSinglePrediction: function(row, predictions, symbolIcon) {

        let route = predictions.routes[0];
        row.appendChild(this.formatTime(route.time, route.timeInTraffic));

        //summary?
        if (this.config.showSummary) {
            let summary = document.createElement("div");
            summary.classList.add("route-summary");

            if (route.transitInfo) {
                symbolIcon = this.getTransitIcon(predictions.config, route);
                this.buildTransitSummary(route.transitInfo, summary);
            } else {
                summary.innerHTML = route.summary;
            }
            row.appendChild(summary);
        }

        return symbolIcon;
    },

    getDomMultiplePredictions: function(row, p, symbolIcon) {
        row.classList.add("with-multiple-routes");

        for (var j = 0; j < p.routes.length; j++) {
            var routeSummaryOuter = document.createElement("div");
            routeSummaryOuter.classList.add("route-summary-outer");

            var r = p.routes[j];

            routeSummaryOuter.appendChild(this.formatTime(r.time, r.timeInTraffic));

            var summary = document.createElement("div");
            summary.classList.add("route-summary");

            if (r.transitInfo) {
                symbolIcon = this.getTransitIcon(p.config, r);
                this.buildTransitSummary(r.transitInfo, summary);

            } else {
                summary.innerHTML = r.summary;
            }
            routeSummaryOuter.appendChild(summary);
            row.appendChild(routeSummaryOuter);

        }
        return symbolIcon;
    },

    renderMap: function(prediction) {

        if (prediction.config.label in this.mapCache) {
            this.mapCache[prediction.config.label].directionsRenderer.setDirections(prediction.rawResponse);
        } else {


            const mapWrapper = document.createElement("div");
            mapWrapper.className += " map";
            mapWrapper.style.height = prediction.config.map.height;
            mapWrapper.style.width = prediction.config.map.width;

            const map = new google.maps.Map(mapWrapper, {
                zoom: 13,
                styles: dark_roadmap,
                disableDefaultUI: true,
            });

            // trafficLayer = new google.maps.TrafficLayer({
            //     map: map,
            // });

            const directionsRenderer = new google.maps.DirectionsRenderer({
                map: map,
                directions: prediction.rawResponse,
                suppressMarkers: true,
                polylineOptions: {
                    strokeColor: "red"
                }
            });

            if (prediction.config.map.hasOwnProperty("zoom")) {
                // google.maps.event.addListenerOnce(map, 'bounds_changed', function() {
                //     map.setZoom(prediction.config.map.zoom);
                // });
            }

            this.mapCache[prediction.config.label] = {mapWrapper, map, directionsRenderer};

        }

        const self = this;
        setTimeout(function() {
            self.mapCache[prediction.config.label].map.fitBounds(prediction.routes[0].bounds);
            let padding = 10;
            let newBounds = self.paddedBounds(self.mapCache[prediction.config.label].map, prediction.routes[0].bounds, padding, padding, padding, padding);
            self.mapCache[prediction.config.label].map.fitBounds(newBounds);
        }, 3000);

        self.mapCache[prediction.config.label].map.fitBounds(prediction.routes[0].bounds);
        return this.mapCache[prediction.config.label].mapWrapper;
    },

    paddedBounds: function(map, bounds, npad, spad, epad, wpad) {
        var SW = bounds.getSouthWest();
        var NE = bounds.getNorthEast();
        var topRight = map.getProjection().fromLatLngToPoint(NE);
        var bottomLeft = map.getProjection().fromLatLngToPoint(SW);
        var scale = Math.pow(2, map.getZoom());

        var SWtopoint = map.getProjection().fromLatLngToPoint(SW);
        var SWpoint = new google.maps.Point(((SWtopoint.x - bottomLeft.x) * scale) + wpad, ((SWtopoint.y - topRight.y) * scale) - spad);
        var SWworld = new google.maps.Point(SWpoint.x / scale + bottomLeft.x, SWpoint.y / scale + topRight.y);
        var pt1 = map.getProjection().fromPointToLatLng(SWworld);

        var NEtopoint = map.getProjection().fromLatLngToPoint(NE);
        var NEpoint = new google.maps.Point(((NEtopoint.x - bottomLeft.x) * scale) - epad, ((NEtopoint.y - topRight.y) * scale) + npad);
        var NEworld = new google.maps.Point(NEpoint.x / scale + bottomLeft.x, NEpoint.y / scale + topRight.y);
        var pt2 = map.getProjection().fromPointToLatLng(NEworld);

        return new google.maps.LatLngBounds(pt1, pt2);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === 'GOOGLE_TRAFFIC_RESPONSE' + this.identifier) {
            this.predictions = payload;
            this.loadPredictions();
            this.isHidden = false;
        }
    },

    loadPredictions: function() {
        if (this.loading) {
            this.loading = false;
            if (this.isHidden) {
                this.updateDom();
                this.show(1000, {lockString: this.identifier});
            } else {
                this.updateDom(1000);
            }
        } else {
            this.updateDom();
            this.show(1000, {lockString: this.identifier});
        }
    },

    notificationReceived: function(notification, payload, sender) {
        if (notification == 'DOM_OBJECTS_CREATED' && !this.inWindow) {
            this.hide(0, {lockString: this.identifier});
            this.isHidden = true;
        } else if (notification === 'MOTION_DETECTED') {
            this.config.ttsEnabled = true;
            this.rescheduleInterval();
        } else if (notification === 'MOTION_STOPPED') {
            this.config.ttsEnabled = false;
        }
    }

});
