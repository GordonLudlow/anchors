// search.js
// open portals.json
// find the best 2 anchor layered field
// send incremental results back to the main thread via postMessage
var portals = [];
var bestSize = 0;
var visited = [];
var debugCount = 0;
var debugCountUntil = 0;

// The algorithm:
// intialize best_solutions_size to 0
// for i in 0...n-2
//     for j in i+1..n-1
//         Partition points other than i, j into two sets depending on which side of the line i->j they lie
//         Call the recursive function with i,j and each set
// Recursive function:
// if the size of the potential solution set is less than best_solution_size, early out
// if this potential solution set has already been visited, early out
// for each pair of points k,l in the potential solution set
//     if the lines i,k and j,l intersect or the lines i,l and j,k intersect
//        recurse with i, j and set - k
//        recurse with i, j and set - l
//        return
// if no such intersections are found, the solution set is valid, set best_solution_size to the size of the set

// It's O(n^4) or maybe O(n^2 * n!)

// An alternative that might be fast enough:
// for i in 0...n-2
//     for j in i+1..n-1
//         Partition points other than i, j into two sets depending on which side of the line i->j they lie and save {i,j,size of largest partition}
// Sort i,j by size of largest position and consider anchor pairs in decreasing order of partition size.  Left and right partitions of i,j will not generally be considered one after the other
// Loop through partition candidates until the size of the largest partition is less than the best solution found so far.  For each, call the resursive function with i, j, partition
// Recursive function (i, j, candidates):
// if visited, early out
// if size of candidates < best so far, early out
// for each point k in candidates:
//     partition the other points in candidates based on which quadrant of i->k and j->k they lie:
//
//   \   "in   /
//    \  <ik  /
//     \ >jk /
//      \   /
// "out" \ /   "out"
// <ik    k    >ik
// <jk   / \   >jk
//      /   \
//     / >ij \
//    /  <jk  \
//   /   "in"  \
//  i           j
//
//  If there are no "out" points, we have a solution
//  If there are "out" points, recurse twice and return
//      Recursion parameters are:
//      1. candidates - k
//      2. candidates - all "out" points

// This alternative has two optimizations of the original.
// 1. Each time we recurse we narrow the solutions set by a lot more.  The original was only removing one point at a time.  The alternative removes as many as possible.
// 2. By sorting by partition size, we can stop sooner.  We were early outing in the original, but we still had to call into the recursive funciton to check for the early out.
// If it isn't noticably faster... profile.  The n^2 outer loop isn't the problem.  I'm never going to have n of 1000.  It's the inner loop recursion part that's really slow.  n of 20 is passable.  n of 40 is way slow.

function whichSide(k, i, j) {
    // which side of the line i,j is k on
    let ilat = i.lat;
    let ilng = i.lng;
    return (k.lat - ilat) * (j.lng - ilng) - (k.lng - ilng) * (j.lat - ilat);
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

let debugCallCount = 0;
function findBest(anchor1, anchor2, candidates) {
    if (debugCallCount<debugCountUntil) {
        let message = "findBest(";
        message += anchor1 + ", ";
        message += anchor2 + ", ";
        message += "candidates = [";

        for (let portal of candidates) {
            message += " " + portal;
        }
        console.log(message + " ])");        
    }
    if (candidates.length < bestSize) {
        if (debugCallCount<debugCountUntil) {
            console.log("Early out: too few candidates");
        }
        return;
    }
    key = JSON.stringify(Array.prototype.slice.call(arguments));
    if (visited.includes(key)) {
        if (debugCallCount<debugCountUntil) {
            console.log("Early out: already visited");
        }
        return;
    }
    visited.push(key);

    for (let k =0; k < candidates.length; k++) {
    
        let inSet = [];
        let outSet = [];    
    
        for (let other=0; other<candidates.length; other++) {
            if (other==k) continue;
            let ikSide = (whichSide(portals[candidates[other]], portals[anchor1], portals[candidates[k]]) > 0);
            let jkSide = (whichSide(portals[candidates[other]], portals[anchor2], portals[candidates[k]]) > 0);
            if (ikSide == jkSide) {
                outSet.push(other);
            }
            else {
                inSet.push(other);
            }
        }
    
        // Debugging of in/out partition
        if (debugCallCount<debugCountUntil) {
            debugCallCount++;        
            let inReport = [];
            let outReport = [];
            for (inside of inSet) {
                inReport.push(candidates[inside]);
            }
            for (outside of outSet) {
                outReport.push(candidates[outside]);
            }
            postMessage({type: "debug", i: anchor1, j:anchor2, k: candidates[k], in: inReport, out: outReport});
        }
    
        if (outSet.length) {
            //  If there are "out" points, recurse twice and return
            //      Recursion parameters are:
            //      1. candidates - k
            //      2. candidates - all "out" points
            var noK = candidates.slice();
            noK.splice(k,1);
            var noOut = candidates.slice();
            outSet.sort();
            while (outSet.length) {
                let last = outSet.pop();
                noOut.splice(last, 1);
            }
            findBest(anchor1, anchor2, noK);
            findBest(anchor1, anchor2, noOut);
            return;
        }
    }
    
    // All candidates considered, this is the best so far (or at least a tie for best)
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
   
    let message = "best";
    if ( candidates.length == bestSize) {
        message = "tie";
    }
    else {
        bestSize = candidates.length;
    }
    
    postMessage({type: message, anchors: [anchor1, anchor2], points: candidates});

}

onmessage = function(message) {

    portals = message.data;

    // For each pair of potential anchors, partition all other points into which side of the line they're on
    let partitions = [];
    for (var i=0; i < portals.length-1; i++) {
        for (var j=i+1; j<portals.length; j++) {
            var right = [];
            var left = [];
            for (var k=0; k<portals.length;k++) {
                if (k==i || k==j) {
                    continue;
                }
                var d = whichSide(portals[k], portals[i], portals[j]);
                if (d < 0) {
                    // to the right of i->j
                    right.push(k);
                }
                else if (d > 0) {
                    // to the left of i->j
                    left.push(k);
                }
            }
            partitions.push({i:i,j:j,partition:right});
            partitions.push({i:i,j:j,partition:left});            
        }
    }
    
    // Sort by decreasing partition size
    partitions.sort(function(a,b) {
        return b.partition.length - a.partition.length;
    });
    
    for (let p=0; p<partitions.length;p++) {
        if (partitions[p].partition.length < bestSize) {
            break;
        }
        visited.length = 0;
        postMessage({type: "anchor", index: 0,  lat: portals[partitions[p].i].lat, lng: portals[partitions[p].i].lng});
        postMessage({type: "anchor", index: 1,  lat: portals[partitions[p].j].lat, lng: portals[partitions[p].j].lng});
        findBest(partitions[p].i, partitions[p].j, partitions[p].partition);
    }
    postMessage({type: "done"});
};
