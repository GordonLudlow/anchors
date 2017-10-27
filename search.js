// search.js
// open portals.json
// find the best 2 anchor layered field
// send incremental results back to the main thread via postMessage
var portals = [];
var bestSize = 0;
var visited = [];

function whichSide(k, i, j) {
    // which side of the line i,j is k on
    return (k.lat - i.lat) * (j.lng - i.lng) - (k.lng - i.lng) * (j.lat - i.lat);
}
function Turn(p1, p2, p3) {
  a = p1.lng; b = p1.lat; 
  c = p2.lng; d = p2.lat;
  e = p3.lng; f = p3.lat;
  A = (f - b) * (c - a);
  B = (d - b) * (e - a);
  return (A > B + Number.EPSILON) ? 1 : (A + Number.EPSILON < B) ? -1 : 0;
}

var intersections = [];
function isIntersect(p1, p2, p3, p4) {
    result = (Turn(p1, p3, p4) != Turn(p2, p3, p4)) && (Turn(p1, p2, p3) != Turn(p1, p2, p4));
    /*
    if (result) {
        var linePath1 = [p1,p2];
        var line1 = new google.maps.Polyline({
            path: linePath1,
            strokeColor: '#FF0000',
            map: map
        });        
        linePath2 = [p3,p4];
        var line2 = new google.maps.Polyline({
            path: linePath2,
            strokeColor: '#FF0000',
            map: map
        }); 
    }
    */
    return result; 
}

var isIntersection = (function() {
    var memo = {};
    var slice = Array.prototype.slice;
    function f(p1,p2,p3,p4) {
        var args = slice.call(arguments);
        var value;

        if (args in memo) {
            value = memo[args];
            //console.log("redundant", p1, p2, p3, p4);
        } else {
            value = isIntersect(portals[p1], portals[p2], portals[p3], portals[p4]);
            memo[args] = value;
        }
        return value;
    }
    return f;
})();    

function distanceSquaredToLineSegment2(lx1, ly1, ldx, ldy, lineLengthSquared, px, py) {
   var t; // t===0 at line pt 1 and t ===1 at line pt 2
   if (!lineLengthSquared) {
      // 0-length line segment. Any t will return same result
      t = 0;
   }
   else {
      t = ((px - lx1) * ldx + (py - ly1) * ldy) / lineLengthSquared;

      if (t < 0)
         t = 0;
      else if (t > 1)
         t = 1;
   }
   
   var lx = lx1 + t * ldx,
       ly = ly1 + t * ldy,
       dx = px - lx,
       dy = py - ly;
   return dx*dx + dy*dy;   
}
function sqDistToAnchorLine(lx1, ly1, ldx, ldy, anchorLenthSq, point) {
    return distanceSquaredToLineSegment2(lx1, ly1, ldx, ldy, anchorLenthSq, portals[point].lat, portals[point].lng);
}

function findBest(anchor1, anchor2, candidates) {
    if (candidates.length <= bestSize) {
        return;
    }
    
    key = JSON.stringify(Array.prototype.slice.call(arguments));
    if (visited.includes(key)) {
        return;
    }
    visited.push(key);
    
    //console.log(candidates);
    for (var i=0; i<candidates.length-1; i++) {
        for (var j=i+1; j<candidates.length; j++) {
            // Check for intersections
            if (isIntersection(anchor1, candidates[i], anchor2, candidates[j])
             || isIntersection(anchor1, candidates[j], anchor2, candidates[i])) {
                // Intersection, so i and j can't both be candidates
                // Try without i and without j
                var noI = candidates.slice();
                noI.splice(i,1);
                var noJ = candidates.slice();
                noJ.splice(j,1);
                findBest(anchor1, anchor2, noI);
                findBest(anchor1, anchor2, noJ);
                return;
            }
        }
    }
    // No intersections, this is the best so far
    bestSize = candidates.length;
    //console.log("Best size is now " + bestSize);
    //console.log(anchor1);
    //console.log(anchor2);        
    //console.log(candidates);
    
    // Sort them in increasing distance from anchor line
    var lx1 = portals[anchor1].lat;
    var ly1 = portals[anchor1].lng;
    var ldx = portals[anchor2].lat - lx1;
    var ldy = portals[anchor2].lng - ly1;
    var anchorLenthSq = ldx*ldx + ldy*ldy;
    
    for (var i=0; i < candidates.length; i++) {
        portals[candidates[i]].distance = sqDistToAnchorLine(lx1, ly1, ldx, ldy, anchorLenthSq, candidates[i]);
    }

    candidates.sort(function(a,b) {
        return portals[a].distance - portals[b].distance;
    });
   
    postMessage({type: 'best', anchors: [anchor1, anchor2], points: candidates});
}

onmessage = function(message) {

    portals = message.data;
  
    for (var i=0; i< portals.length-1; i++) {
        visited.length = 0;
        postMessage({type: "anchor", index: 0,  lat: portals[i].lat, lng: portals[i].lng});
        for (var j=i+1; j<portals.length; j++) {
            postMessage({type: "anchor", index: 1,  lat: portals[j].lat, lng: portals[j].lng});
            /*
            var linePath = [portals[i], portals[j]];
            var line = new google.maps.Polyline({
                path: linePath,
                map: map
            });
            */
            var right = [];
            var left = [];
            for (var k=0; k<portals.length;k++) {
                if (k==i || k==j) {
                    //makeMarker(portals[k].lat, portals[k].lng, 'neutral.png', portals[k].name);
                    continue;
                }
                var d = whichSide(portals[k], portals[i], portals[j]);
                if (d < 0) {
                    // to the right of i->j
                    //makeMarker(portals[k].lat, portals[k].lng, 'hum_reso_08.png', portals[k].name);
                    right.push(k);
                }
                else if (d > 0) {
                    // to the left of i->j
                    //makeMarker(portals[k].lat, portals[k].lng, 'enl_reso_01.png', portals[k].name);
                    left.push(k);
                }
                //else {
                //    makeMarker(portals[k].lat, portals[k].lng, 'neutral.png', portals[k].name);                       
                //}
            }
            findBest(i, j, right);
            findBest(i, j, left);
        }
    }
    postMessage({type: "done"});
};
