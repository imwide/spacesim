Make asteroids higher poly. Keep the current poly for a further a way LOD but on a closer scale they should look more defined. The smaller ones only need to be a bit higher poly but the bigger ones should not only be higher poly but also have more abstract shapes. The current ones just look like stretched spheres.

Make asteroid groups also spawn around planets just like moons.


Make it possible for planets to have a saturn like asteroid belt around it. Add this to the config of 2 planets already for testing. Add parameters like the starting radius and end radius (so basically how wide and how far the ring is). The ring/belt should at least from a distance simply be a semi-transparent texture. When getting close enough to a part of the belt, this part should radally around the distance from the camera fade out smoothly. This should happen at 500km. The faded out part should be replaced by 2d billboard sprites that are also semi transparent and have the same color as the ring texture in that position. Eventhough they are semi transparent, them overlapping should not add the color. Getting closer than 50km should spawn actual 3d asteroids just like in the current asteroid groups. The other levels of detail of the belt such as the texture and the billboards should still be visible. To not run into performance issues, introduce frustum culling and introduce your own performance optimizations.
These asteroids should obviously not exist as destinations for autopilot, at least not without setting a waypoint.

Improve the "hyperspeed effect" to not be a 2d visual effect ontop of the camera, but to be a "real" 3d effect thats physically around the ship (around 500m distance) and oriented the right way.

The turning can happen really fast right now. The intensity that the turn and rotation of the ship is started at is really high. it should "fade in" and slowly start turning as it is has a lot of weight

While flying the ship (in the pilot seat) allow for switching perspectives. Currently its only third person perspective where the camera orbits around the ship. When pressing a hotkey for swithcing perspectives, it toggles between third person and first person perspective. In first person perspective, the camera should be fixed in place but not rotation, 1m above the ships "pilot seat" position. The ship inside should be rendered again isntead of the outside. The controls should be identical.

Remove the outline effect from the smallest kind of asteroid (the dark blue kind that explodes when shot) and especially from billboards of far away objects since it makes them hard to see.



Prevent the third person camera from clipping through meshes while flying the ship in third person.


The outline postprocessing effect is visible through faces if their normals are facing the wrong way (inside out). This is to be expected and can be fixed in some models, but if you say it is not difficult to fix, please fix it and hide the effect even through faces with the wrong normals.



Ship collisions with stations and asteroids need to work


Ship landing in stations needs to work