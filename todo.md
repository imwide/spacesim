Make asteroids higher poly. Keep the current poly for a further a way LOD but on a closer scale they should look more defined. The smaller ones only need to be a bit higher poly but the bigger ones should not only be higher poly but also have more abstract shapes. The current ones just look like stretched spheres.

Make asteroid groups also spawn around planets just like moons.


Make any planet have a 30% chance to have a saturn like asteroid belt around it. The belt should at least from a distance simply be a semi-transparent texture. When getting close enough to a part of the belt, this part should radally around the distance from the camera fade out smoothly. This should happen at 500km. The faded out part should be replaced by 2d billboard sprites that are also semi transparent and have the same color as the ring texture in that position. Eventhough they are semi transparent, them overlapping should not add the color. Getting closer than 50km should spawn actual 3d asteroids just like in the current asteroid groups. The other levels of detail of the belt such as the texture and the billboards should still be visible. To not run into performance issues, introduce frustum culling and introduce your own performance optimizations.
These asteroids should obviously not exist as destinations for autopilot, at least not without setting a waypoint.

Improve the "hyperspeed effect" to not be a UI visual effect ontop of the camera, but to be a "real" 3d effect thats physically around the ship (around 500m distance) and oriented the right way.

The turning can happen really fast right now. The intensity that the turn and rotation of the ship is started at is really high. it should "fade in" and slowly start turning as it is has a lot of weight



I want to give stations custom models. I have prepared one already. In the config file for the star system you just made, add the option to configure stations more. I want to put a path to a glb there, set the "outmost border" radius for eachs tation (which is used for the speed limit field aswell as the safe zone/no shooting zone around stations) aswell as a stations name



if you want REAL crisp outlines (still 0 tris):
post-process (best for games)

in engine (like three.js):

use sobel edge detection shader
or outline pass

this is how most games do it → not in the model, but screen-space