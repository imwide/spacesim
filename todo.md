Make asteroids higher poly. Keep the current poly for a further a way LOD but on a closer scale they should look more defined. The smaller ones only need to be a bit higher poly but the bigger ones should not only be higher poly but also have more abstract shapes. The current ones just look like stretched spheres.

Make asteroid groups also spawn around planets just like moons.


Make it possible for planets to have a saturn like asteroid belt around it. Add this to the config of 2 planets already for testing. Add parameters like the starting radius and end radius and the rotation of the ring. The ring/belt should at least from a distance simply be a semi-transparent texture. When getting close enough to a part of the belt, this part should radally around the distance from the camera fade out smoothly. This should happen at 500km. The faded out part should be replaced by 2d billboard sprites that are also semi transparent and have the same color as the ring texture in that position. Eventhough they are semi transparent, them overlapping should not add the color. Getting closer than 50km should spawn actual 3d asteroids just like in the current asteroid groups. The other levels of detail of the belt such as the texture and the billboards should still be visible. To not run into performance issues, introduce frustum culling and introduce your own performance optimizations.
These single asteroids should obviously not exist as destinations for autopilot.

Improve the "hyperspeed effect" to not be a 2d visual effect ontop of the camera, but to be a "real" 3d effect thats physically around the ship (around 500m distance) and oriented the right way.

The turning can happen really fast right now. The intensity that the turn and rotation of the ship is started at is really high. it should "fade in" and slowly start turning as it is has a lot of weight

While flying the ship (in the pilot seat) allow for switching perspectives. Currently its only third person perspective where the camera orbits around the ship. When pressing a hotkey for swithcing perspectives, it toggles between third person and first person perspective. In first person perspective, the camera should be fixed in place but not rotation, 1m above the ships "pilot seat" position. The ship inside should be rendered again isntead of the outside. The controls should be identical.


Ship collisions with stations and asteroids need to work


The outline shader doesnt show outlines if the face "behind" it has the same or similar direction normals. This doesnt look good. If the angle is enough at an edge, the outline should be shown regardless of the direction of the normals of the face behind it.

BLENDER TODO: Apply array modifier, fix normal directions, add "AC" using planes to the machines, ships and station

A player should not be able to turn on autopilot while inside the "outermost boundry" of a station (basically meaning while inside a station)#

While travelling over 2km/s and/or while autopilto is enabled, shooting should not eb posisble/do nothing

When the player leaves the ship/pilot seat, the ship should slowly turn horizontal.

Using the relative thruster coordinates for each ship, display thruster particle effects at the thruster positions depending on the current acceleration and speed, just like the gun/shooting particles work using the relative config coordinates

Add anti-aliasing to the outline shader.

Ship landing in stations needs to work

In three.js everything is somehow directionally shaded. can you change the light direction of the client to be to wherever the sun is relative to the player?

Add light sequences to the station configs. This will allow every station to have a array of relative coordinates (that will also be shown with the debug crosshairs)


Remove space tablet in favor of a new UI