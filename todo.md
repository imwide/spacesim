Make asteroids higher poly. Keep the current poly for a further a way LOD but on a closer scale they should look more defined. The smaller ones only need to be a bit higher poly but the bigger ones should not only be higher poly but also have more abstract shapes. The current ones just look like stretched spheres.

Make asteroid groups also spawn around planets just like moons.


Make any planet have a 30% chance to have a saturn like asteroid belt around it. The belt should at least from a distance simply be a semi-transparent texture. When getting close enough to a part of the belt, this part should radally around the distance from the camera fade out smoothly. This should happen at 500km. The faded out part should be replaced by 2d billboard sprites that are also semi transparent and have the same color as the ring texture in that position. Eventhough they are semi transparent, them overlapping should not add the color. Getting closer than 50km should spawn actual 3d asteroids just like in the current asteroid groups. The other levels of detail of the belt such as the texture and the billboards should still be visible. To not run into performance issues, introduce frustum culling and introduce your own performance optimizations.


Improve the "hyperspeed effect" to not be a UI visual effect ontop of the camera, but to be a "real" 3d effect thats physically around the ship (around 500m distance) and oriented the right way.

The turning can happen really fast right now. The intensity that the turn and rotation of the ship is started at is really high. it should "fade in" and slowly start turning as it is has a lot of weight

Remove the crosshair

To the config file of each ship add two fields that can each be lists of relative corrdinates for the ship. One of them should determine the position(s) of the thrusters (to later determine where to spawn particles) and the other should determine the position(s) of the "guns" (to later determine where to spawn projectiles). These coordinates should be relative to the ship's center and should be rotated with the ship. This way we can have different ships with different thruster and gun positions without having to hardcode them in the code.

Make the star shine way brighter. Make the flares and glow more intense even at long distances and make them increase "exponentially" the closer you get. Also dont completley remove the glow if the star itself is opbstructed or slightly off screen for a more realistic behavior
