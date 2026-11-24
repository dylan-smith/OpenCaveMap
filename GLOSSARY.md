# OpenCaveMap

Recording underwater cave survey data and, eventually, turning it into cave maps.

## Language

**Project**:
One cave, and all the survey data collected in it over time.
_Avoid_: Cave, system, trip, expedition

**Segment**:
A continuous sequence of stations joined by shots, surveyed in one go. A project holds many segments, and one day of diving can produce several.
_Avoid_: Survey, section, traverse, line

**Station**:
A fixed point along the cave line where the surveyor stops and records a depth.
_Avoid_: Point, node, waypoint

**Shot**:
The measurement between two consecutive stations: a distance and an azimuth.
_Avoid_: Leg, vector

**Azimuth**:
The compass direction of a shot, from one station towards the next.
_Avoid_: Bearing, heading

**Note**:
Free text the surveyor recorded about a segment, a station or a shot.
_Avoid_: Comment, remark, annotation

**Unit system**:
Whether distances and depths are entered and shown in metric (metres) or imperial (feet). It changes how a measurement is presented, never the measurement itself.
_Avoid_: Units, measurement system

**Label**:
The identifier the software gives a station or a shot, made of its segment's number and its position in that segment. Stations count from 0 and shots from 1, so shot `3.2` runs from station `3.1` to station `3.2`. Surveyors never choose labels.
_Avoid_: Name, ID
